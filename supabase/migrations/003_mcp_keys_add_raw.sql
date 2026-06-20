-- Store the raw key so users can copy it from the settings page at any time.
-- The key_hash column is still used for auth lookups (fast, indexed).
alter table mcp_api_keys add column if not exists key_raw text;
