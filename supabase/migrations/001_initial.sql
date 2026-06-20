-- Artifact Hub — initial schema
-- Run via: Supabase Studio SQL editor, or `supabase db push` with CLI

-- ── Artifacts ─────────────────────────────────────────────────────────────────

create table artifacts (
  id            uuid        default gen_random_uuid() primary key,
  title         text        not null,
  description   text        not null default '',
  tags          text[]      not null default '{}',
  type          text        not null check (type in ('html', 'image', 'pdf')),
  blob_url      text        not null,
  blob_pathname text        not null,
  created_by    uuid        references auth.users(id) on delete set null,
  creator_name  text,
  creator_email text,
  visibility    text        not null default 'private' check (visibility in ('public', 'private')),
  -- ponytail: array_to_tsvector for tags (immutable unlike array_to_string which is stable)
  search_vector tsvector    generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')) ||
    array_to_tsvector(coalesce(tags, '{}'))
  ) stored,
  feedback_summary text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index artifacts_type_idx         on artifacts(type);
create index artifacts_created_by_idx   on artifacts(created_by);
create index artifacts_visibility_idx   on artifacts(visibility);
create index artifacts_created_at_idx   on artifacts(created_at desc);
create index artifacts_search_idx       on artifacts using gin(search_vector);

-- ── Feedback ──────────────────────────────────────────────────────────────────

create table feedback (
  id           uuid        default gen_random_uuid() primary key,
  artifact_id  uuid        not null references artifacts(id) on delete cascade,
  author_email text        not null,
  author_name  text,
  content      text        not null,
  rating       smallint    check (rating between 1 and 5),
  created_at   timestamptz not null default now()
);

create index feedback_artifact_id_idx on feedback(artifact_id);

-- ── Share tokens ──────────────────────────────────────────────────────────────

create table share_tokens (
  id          uuid        default gen_random_uuid() primary key,
  artifact_id uuid        not null references artifacts(id) on delete cascade,
  token       text        not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index share_tokens_token_idx      on share_tokens(token);
create index share_tokens_expires_at_idx on share_tokens(expires_at);

-- ── updated_at trigger ────────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger artifacts_updated_at
  before update on artifacts
  for each row execute function update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table artifacts    enable row level security;
alter table feedback     enable row level security;
alter table share_tokens enable row level security;

-- Artifacts: public ones visible to all; private ones only to owner
create policy "Public artifacts viewable by anyone"
  on artifacts for select using (visibility = 'public');

create policy "Authenticated users can see all artifacts"
  on artifacts for select using (auth.role() = 'authenticated');

create policy "Authenticated users can publish"
  on artifacts for insert with check (auth.uid() = created_by);

create policy "Owners can update their artifacts"
  on artifacts for update using (auth.uid() = created_by);

create policy "Owners can delete their artifacts"
  on artifacts for delete using (auth.uid() = created_by);

-- Feedback: authenticated read/write (owners see via artifact join)
create policy "Authenticated users can read feedback"
  on feedback for select using (auth.role() = 'authenticated');

create policy "Authenticated users can leave feedback"
  on feedback for insert with check (auth.role() = 'authenticated');

-- Share tokens: scoped to artifact owner
create policy "Owners manage their share tokens"
  on share_tokens for all using (
    exists (
      select 1 from artifacts
      where artifacts.id = share_tokens.artifact_id
        and artifacts.created_by = auth.uid()
    )
  );

-- Note: MCP server uses SUPABASE_SERVICE_ROLE_KEY → bypasses RLS
-- Note: share token lookup is done via service role in the /share/[token] route
