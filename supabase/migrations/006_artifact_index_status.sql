-- Migration 006: track RAG indexing status per artifact
alter table artifacts
  add column if not exists index_status text not null default 'pending'
  check (index_status in ('pending', 'indexed', 'failed'));
