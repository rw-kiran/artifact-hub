-- ── Migration 004: RAG / pgvector ─────────────────────────────────────────────
-- Prerequisites:
--   1. Enable the vector extension in Supabase Dashboard:
--      Database → Extensions → search "vector" → Enable
--   2. Then run this file in the SQL editor.

create extension if not exists vector with schema extensions;

-- ── Chunk storage ──────────────────────────────────────────────────────────────
create table if not exists artifact_chunks (
  id           uuid         default gen_random_uuid() primary key,
  artifact_id  uuid         not null references artifacts(id) on delete cascade,
  chunk_index  smallint     not null,
  content      text         not null default '',
  embedding    extensions.vector(1536) not null,  -- gemini-embedding-001 @ 1536 dims (fits HNSW 2000-dim limit)
  token_count  smallint     not null default 0,
  created_at   timestamptz  not null default now(),
  constraint artifact_chunks_artifact_chunk_unique unique (artifact_id, chunk_index)
);

create index if not exists artifact_chunks_artifact_id_idx
  on artifact_chunks(artifact_id);

-- HNSW: better query latency than IVFFlat for dynamic inserts; no training needed
create index if not exists artifact_chunks_embedding_idx
  on artifact_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table artifact_chunks enable row level security;

-- All chunk reads/writes go through the service role client (bypasses RLS)
create policy "Service role manages chunks"
  on artifact_chunks for all
  using (true)
  with check (true);

-- ── hybrid_search RPC ──────────────────────────────────────────────────────────
-- Combines BM25 (Supabase tsvector) + cosine semantic search via Reciprocal Rank Fusion.
-- bm25_weight + semantic_weight need not sum to 1; they scale the RRF scores independently.
create or replace function hybrid_search(
  query_embedding  extensions.vector(1536),
  query_text       text,
  match_count      int     default 10,
  bm25_weight      float   default 0.3,
  semantic_weight  float   default 0.7,
  rrf_k            int     default 60
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
  -- BM25 leg: ts_rank over the pre-built search_vector GIN index
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
  -- Semantic leg: closest chunk per artifact (HNSW scan), then rank by distance
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
      order by ac.artifact_id, ac.embedding <=> query_embedding
      limit 200
    ) closest
    order by min_dist
    limit 50
  ),
  -- Reciprocal Rank Fusion
  rrf as (
    select
      coalesce(b.id, s.id) as id,
      (
        coalesce(bm25_weight    / (rrf_k + b.rank)::float, 0.0) +
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
