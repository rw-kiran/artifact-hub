-- ── Migration 005: Fix RAG dims — text-only embeddings (1536 dims) ───────────
-- 004_rag.sql failed on HNSW index creation because pgvector caps HNSW at 2000 dims.
-- This migration drops the partial 004 state and recreates with 1536-dim vectors
-- (gemini-embedding-001 with outputDimensionality:1536, within pgvector's HNSW limit).

-- Enable pgvector (idempotent; safe to run even if already enabled)
create extension if not exists vector with schema extensions;

-- Clean up any partial state from 004
drop function if exists hybrid_search cascade;
drop table if exists artifact_chunks cascade;

-- ── Chunk storage (1536 dims) ──────────────────────────────────────────────────
create table artifact_chunks (
  id           uuid         default gen_random_uuid() primary key,
  artifact_id  uuid         not null references artifacts(id) on delete cascade,
  chunk_index  smallint     not null,
  content      text         not null default '',
  embedding    extensions.vector(1536) not null,
  token_count  smallint     not null default 0,
  created_at   timestamptz  not null default now(),
  constraint artifact_chunks_artifact_chunk_unique unique (artifact_id, chunk_index)
);

create index artifact_chunks_artifact_id_idx
  on artifact_chunks(artifact_id);

-- 1536 dims is well within pgvector's 2000-dim HNSW limit
create index artifact_chunks_embedding_idx
  on artifact_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table artifact_chunks enable row level security;

create policy "Service role manages chunks"
  on artifact_chunks for all
  using (true)
  with check (true);

-- ── hybrid_search RPC (1536 dims) ──────────────────────────────────────────────
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
