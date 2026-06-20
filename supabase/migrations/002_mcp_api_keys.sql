-- ── MCP API Keys ──────────────────────────────────────────────────────────────
-- Per-user keys for authenticating against the MCP server.
-- Raw key is never stored — only the SHA-256 hash.

create table mcp_api_keys (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null default 'My Key',
  key_prefix   text        not null,   -- first 12 chars of raw key, safe to display
  key_hash     text        not null unique,
  created_at   timestamptz default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index mcp_api_keys_user_id_idx  on mcp_api_keys(user_id);
create index mcp_api_keys_key_hash_idx on mcp_api_keys(key_hash);

alter table mcp_api_keys enable row level security;

create policy "Users manage own MCP keys"
  on mcp_api_keys for all using (auth.uid() = user_id);
