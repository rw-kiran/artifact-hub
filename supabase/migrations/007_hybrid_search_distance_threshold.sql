-- ── Migration 007: Add cosine distance threshold to hybrid_search ──────────────
-- Without a threshold, HNSW always returns K nearest neighbours regardless of
-- relevance — a nonsense query still surfaces artifacts ranked by "least
-- unrelated" cosine distance, making the semantic leg meaningless for truly
-- off-topic queries.  Adding `max_distance` to the semantic CTE WHERE clause
-- causes the leg to return zero rows when nothing is close enough, so the full
-- outer join produces only BM25 hits (or nothing at all).
--
-- Default 0.7 cosine distance ≈ cosine similarity 0.3 — a conservative floor
-- that filters truly unrelated content.  Lower the value in lib/ai/search.ts
-- (SIMILARITY_THRESHOLD) to make search stricter; raise it to be more liberal.

drop function if exists hybrid_search(extensions.vector(1536), text, int, float, float, int);

create or replace function hybrid_search(
  query_embedding  extensions.vector(1536),
  query_text       text,
  match_count      int     default 10,
  bm25_weight      float   default 0.3,
  semantic_weight  float   default 0.7,
  rrf_k            int     default 60,
  max_distance     float   default 0.7   -- cosine distance ceiling for semantic leg
)
returns table (
  artifact_id   uuid,
  title         text,
  description   text,
  type          text,
  tags          text[],
  blob_url      text,
  creator_name  text,
  created_at    timestamptz,
  rrf_score     float
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
    select
      id,
      row_number() over (order by min_dist) as rank
    from (
      select distinct on (ac.artifact_id)
        ac.artifact_id as id,
        ac.embedding <=> query_embedding as min_dist
      from artifact_chunks ac
      join artifacts a on a.id = ac.artifact_id
      where a.visibility = 'public'
        and ac.embedding <=> query_embedding < max_distance   -- threshold gate
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
      ) as score
    from bm25 b
    full outer join semantic s on s.id = b.id
  )
  select
    a.id          as artifact_id,
    a.title,
    a.description,
    a.type,
    a.tags,
    a.blob_url,
    a.creator_name,
    a.created_at,
    r.score       as rrf_score
  from rrf r
  join artifacts a on a.id = r.id
  order by r.score desc
  limit match_count;
$$;

grant execute on function hybrid_search to service_role;
