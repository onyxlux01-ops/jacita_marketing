-- Social publishing reliability layer

-- Expand job statuses
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'publish_job_status' and e.enumlabel = 'retrying'
  ) then
    alter type public.publish_job_status add value 'retrying';
  end if;
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'publish_job_status' and e.enumlabel = 'expired'
  ) then
    alter type public.publish_job_status add value 'expired';
  end if;
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'publish_job_status' and e.enumlabel = 'ready'
  ) then
    alter type public.publish_job_status add value 'ready';
  end if;
end $$;

alter table public.social_publish_jobs
  add column if not exists error_code text,
  add column if not exists error_type text,
  add column if not exists external_url text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists content_version_hash text,
  add column if not exists payload_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists missed_policy text,
  add column if not exists simulated boolean not null default false;

alter table public.social_publish_jobs
  alter column max_attempts set default 4;

update public.social_publish_jobs
set max_attempts = greatest(max_attempts, 4)
where max_attempts < 4;

-- Deduplicate active jobs before unique index (pending/processing only —
-- newly added enum values cannot be referenced in the same transaction)
with ranked as (
  select id,
    row_number() over (
      partition by content_id, social_account_id
      order by created_at desc
    ) as rn
  from public.social_publish_jobs
  where status in ('pending', 'processing')
)
update public.social_publish_jobs j
set status = 'cancelled',
    error_message = 'Cancelled duplicate active job during reliability migration'
from ranked r
where j.id = r.id and r.rn > 1;

create unique index if not exists social_publish_jobs_active_unique
  on public.social_publish_jobs (content_id, social_account_id)
  where status in ('pending', 'processing');

create index if not exists social_publish_jobs_account_idx
  on public.social_publish_jobs (social_account_id, status);

create index if not exists social_publish_jobs_idempotency_idx
  on public.social_publish_jobs (idempotency_key)
  where idempotency_key is not null;

alter table public.social_publish_logs
  add column if not exists error_type text,
  add column if not exists duration_ms integer,
  add column if not exists response_summary jsonb not null default '{}'::jsonb;

alter table public.organisations
  add column if not exists timezone text not null default 'Europe/London';

alter table public.social_accounts
  add column if not exists health_status text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'social_accounts_health_status_check'
  ) then
    alter table public.social_accounts
      add constraint social_accounts_health_status_check
      check (health_status in (
        'unknown', 'healthy', 'attention', 'reauth_required', 'disconnected'
      ));
  end if;
end $$;

comment on column public.social_publish_jobs.content_version_hash is
  'Hash of content snapshot at queue time — stale edits must re-queue';
comment on column public.social_publish_jobs.payload_snapshot is
  'Exact caption/media payload intended for publication';
comment on column public.organisations.timezone is
  'IANA timezone for scheduling display; jobs store UTC timestamptz';
