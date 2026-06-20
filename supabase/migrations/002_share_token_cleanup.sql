-- Prune expired share tokens for the same artifact on each insert,
-- so tokens don't accumulate forever without a cron job.
create or replace function prune_expired_share_tokens()
returns trigger language plpgsql as $$
begin
  delete from share_tokens
  where artifact_id = new.artifact_id and expires_at < now();
  return new;
end;
$$;

create trigger share_tokens_prune_on_insert
  before insert on share_tokens
  for each row execute function prune_expired_share_tokens();
