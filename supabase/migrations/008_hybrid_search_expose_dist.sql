-- ── Migration 008: Expose min_cosine_dist in hybrid_search return ──────────────
-- Adds the actual cosine distance to the return set so TypeScript can:
--   (a) filter on it independently of the SQL max_distance parameter, and
--   (b) log it in dev to calibrate the threshold against real data.
-- BM25-only results (no semantic match) return null for min_cosine_dist.

drop function if exists hybrid_search(extensions.vector(1536), text, int, float, float, int, float);

create or replace function hybrid_search(
  query_embedding  extensions.vector(1536),
  query_text       text,
  match_count      int     default 10,
  bm25_weight      float   default 0.3,
  semantic_weight  float   default 0.7,
  rrf_k            int     default 60,
  max_distance     float   default 0.40
)
returns table (
  artifact_id      uuid,
  title            text,
  description      text,
  type             text,
  tags             text[],
  blob_url         text,
  creator_name     text,
  created_at       timestamptz,
  rrf_score        float,
  min_cosine_dist  float        -- null for BM25-only results
)
language sql stable security definer
as $$
  with
  bm25 as (
    select
      id,
      row_number() over (
        order by ts_rank(search_vector, websearch_to_tsquery('english', query_text)) desc
      ) as rank
    from artifacts
    where
      visibility = 'public'
      and search_vector @@ websearch_to_tsquery('english', query_text)
    limit 50
  ),
  semantic as (
    select id, min_dist, row_number() over (order by min_dist) as rank
    from (
      select distinct on (ac.artifact_id)
        ac.artifact_id as id,
        ac.embedding <=> query_embedding as min_dist
      from artifact_chunks ac
      join artifacts a on a.id = ac.artifact_id
      where a.visibility = 'public'
        and ac.embedding <=> query_embedding < max_distance
      order by ac.artifact_id, ac.embedding <=> query_embedding
      limit 200
    ) closest
    order by min_dist
    limit 50
  ),
  rrf as (
    select
      coalesce(b.id, s.id) as id,
      (
        coalesce(bm25_weight     / (rrf_k + b.rank)::float, 0.0) +
        coalesce(semantic_weight / (rrf_k + s.rank)::float, 0.0)
      ) as score,
      s.min_dist
    from bm25 b
    full outer join semantic s on s.id = b.id
  )
  select
    a.id, a.title, a.description, a.type, a.tags,
    a.blob_url, a.creator_name, a.created_at,
    r.score        as rrf_score,
    r.min_dist     as min_cosine_dist
  from rrf r
  join artifacts a on a.id = r.id
  order by r.score desc
  limit match_count;
$$;

grant execute on function hybrid_search to service_role;
