-- Social publishing layer: statuses, secrets, jobs, logs, platform publish fields

-- Expand content status with publishing
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'content_status' and e.enumlabel = 'publishing'
  ) then
    alter type public.content_status add value 'publishing';
  end if;
end $$;

create type public.platform_publish_status as enum (
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled'
);

create type public.publish_job_status as enum (
  'pending',
  'processing',
  'published',
  'failed',
  'cancelled'
);

-- social_accounts enrichment
alter table public.social_accounts
  add column if not exists profile_image_url text,
  add column if not exists scopes text[] not null default '{}',
  add column if not exists token_expires_at timestamptz,
  add column if not exists connected_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists last_error text;

-- Encrypted token vault (service role only — no authenticated policies)
create table public.social_account_secrets (
  social_account_id uuid primary key
    references public.social_accounts (id) on delete cascade,
  organisation_id uuid not null
    references public.organisations (id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger social_account_secrets_set_updated_at
  before update on public.social_account_secrets
  for each row
  execute function private.set_updated_at();

alter table public.social_account_secrets enable row level security;
alter table public.social_account_secrets force row level security;
-- Intentionally no policies for authenticated/anon — service_role bypasses RLS

revoke all on public.social_account_secrets from anon, authenticated;
grant all on public.social_account_secrets to service_role;

-- Per-platform publish state on content_platforms
alter table public.content_platforms
  add column if not exists social_account_id uuid
    references public.social_accounts (id) on delete set null,
  add column if not exists publish_status public.platform_publish_status
    not null default 'draft',
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists external_post_id text,
  add column if not exists error_message text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists caption_override text,
  add column if not exists last_publish_at timestamptz;

create index if not exists content_platforms_social_account_id_idx
  on public.content_platforms (social_account_id);
create index if not exists content_platforms_publish_status_idx
  on public.content_platforms (publish_status);
create index if not exists content_platforms_scheduled_at_idx
  on public.content_platforms (scheduled_at)
  where scheduled_at is not null;

-- Scheduler jobs (independent of browser)
create table public.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  content_platform_id uuid references public.content_platforms (id) on delete set null,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform public.social_platform not null,
  scheduled_at timestamptz not null,
  status public.publish_job_status not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  published_at timestamptz,
  external_post_id text,
  error_message text,
  locked_at timestamptz,
  lock_token text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger social_publish_jobs_set_updated_at
  before update on public.social_publish_jobs
  for each row
  execute function private.set_updated_at();

create index social_publish_jobs_due_idx
  on public.social_publish_jobs (status, scheduled_at)
  where status = 'pending';
create index social_publish_jobs_organisation_id_idx
  on public.social_publish_jobs (organisation_id);
create index social_publish_jobs_content_id_idx
  on public.social_publish_jobs (content_id);

-- Publishing history log
create table public.social_publish_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  content_platform_id uuid references public.content_platforms (id) on delete set null,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  publish_job_id uuid references public.social_publish_jobs (id) on delete set null,
  platform public.social_platform not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  external_post_id text,
  error_message text,
  attempt_count integer not null default 1,
  request_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger social_publish_logs_set_updated_at
  before update on public.social_publish_logs
  for each row
  execute function private.set_updated_at();

create index social_publish_logs_organisation_id_idx
  on public.social_publish_logs (organisation_id, created_at desc);
create index social_publish_logs_content_id_idx
  on public.social_publish_logs (content_id);

-- Short-lived OAuth state (server-validated; CSRF protection)
create table public.social_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  platform public.social_platform not null,
  redirect_path text not null default '/app/social',
  code_verifier text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index social_oauth_states_state_idx on public.social_oauth_states (state);
create index social_oauth_states_expires_idx on public.social_oauth_states (expires_at);

alter table public.social_oauth_states enable row level security;
alter table public.social_oauth_states force row level security;
revoke all on public.social_oauth_states from anon, authenticated;
grant all on public.social_oauth_states to service_role;

-- RLS for jobs + logs
alter table public.social_publish_jobs enable row level security;
alter table public.social_publish_jobs force row level security;
alter table public.social_publish_logs enable row level security;
alter table public.social_publish_logs force row level security;

create policy social_publish_jobs_select
  on public.social_publish_jobs for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy social_publish_jobs_insert_manager
  on public.social_publish_jobs for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy social_publish_jobs_update_manager
  on public.social_publish_jobs for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy social_publish_jobs_delete_manager
  on public.social_publish_jobs for delete to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy social_publish_logs_select
  on public.social_publish_logs for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy social_publish_logs_insert_manager
  on public.social_publish_logs for insert to authenticated
  with check (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

grant select, insert, update, delete on public.social_publish_jobs to authenticated;
grant select, insert on public.social_publish_logs to authenticated;

-- Allow managers to update social accounts including disconnect
-- (policies already exist)

comment on table public.social_account_secrets is
  'Encrypted OAuth tokens. Accessible only via service_role. Never expose to browser.';
comment on column public.social_accounts.token_vault_ref is
  'Reference to social_account_secrets.social_account_id (same id). Never store raw tokens here.';
