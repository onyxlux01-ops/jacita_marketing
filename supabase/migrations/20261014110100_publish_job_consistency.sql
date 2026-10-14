-- =============================================================================
-- Publishing isolation (audit finding 3) + held jobs.
--
-- A publish job's content, content_platforms row and social account must all
-- belong to the same business (and the platform row / account must match the
-- job's platform). Foreign keys only guaranteed existence, so a caller could
-- point a job at another business's content_platforms row. Enforced here for
-- every writer, including the service role used by the publishing worker.
-- =============================================================================

alter table public.social_publish_jobs
  add column if not exists hold_reason text,
  add column if not exists held_at timestamptz;

comment on column public.social_publish_jobs.hold_reason is
  'Why the job is held for re-approval (e.g. ACTOR_NOT_AUTHORISED, CONTENT_NOT_APPROVED, ACCOUNT_CHANGED). Held jobs never run until re-queued.';

create index if not exists social_publish_jobs_held_idx
  on public.social_publish_jobs (organisation_id, status)
  where status = 'held';

-- Report (do not block on) pre-existing inconsistent rows.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.social_publish_jobs j
  left join public.content c on c.id = j.content_id
  left join public.social_accounts a on a.id = j.social_account_id
  left join public.content_platforms cp on cp.id = j.content_platform_id
  where c.organisation_id is distinct from j.organisation_id
     or a.organisation_id is distinct from j.organisation_id
     or a.platform is distinct from j.platform
     or (j.content_platform_id is not null and (
          cp.content_id is distinct from j.content_id
          or cp.platform is distinct from j.platform));
  if v_bad > 0 then
    raise notice 'social_publish_jobs: % pre-existing rows violate org/platform consistency', v_bad;
  end if;
end $$;

create or replace function private.enforce_publish_job_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_org uuid;
  v_account_org uuid;
  v_account_platform public.social_platform;
  v_cp_content uuid;
  v_cp_platform public.social_platform;
begin
  select c.organisation_id into v_content_org
  from public.content c where c.id = new.content_id;
  if v_content_org is distinct from new.organisation_id then
    raise exception 'Publish job content belongs to a different business'
      using errcode = '42501';
  end if;

  select a.organisation_id, a.platform into v_account_org, v_account_platform
  from public.social_accounts a where a.id = new.social_account_id;
  if v_account_org is distinct from new.organisation_id then
    raise exception 'Publish job social account belongs to a different business'
      using errcode = '42501';
  end if;
  if v_account_platform is distinct from new.platform then
    raise exception 'Publish job social account is for a different platform'
      using errcode = '42501';
  end if;

  if new.content_platform_id is not null then
    select cp.content_id, cp.platform into v_cp_content, v_cp_platform
    from public.content_platforms cp where cp.id = new.content_platform_id;
    if v_cp_content is distinct from new.content_id
       or v_cp_platform is distinct from new.platform then
      raise exception 'Publish job platform row does not belong to this content/platform'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_publish_job_consistency() from public, anon, authenticated;

drop trigger if exists social_publish_jobs_consistency on public.social_publish_jobs;
create trigger social_publish_jobs_consistency
  before insert or update of organisation_id, content_id, content_platform_id, social_account_id, platform
  on public.social_publish_jobs
  for each row
  execute function private.enforce_publish_job_consistency();

-- content_platforms.social_account_id must be an account of the content's
-- business and of the row's platform (the publisher writes this column).
create or replace function private.enforce_content_platform_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_org uuid;
  v_account_org uuid;
  v_account_platform public.social_platform;
begin
  if new.social_account_id is null then
    return new;
  end if;
  select c.organisation_id into v_content_org
  from public.content c where c.id = new.content_id;
  select a.organisation_id, a.platform into v_account_org, v_account_platform
  from public.social_accounts a where a.id = new.social_account_id;
  if v_account_org is distinct from v_content_org
     or v_account_platform is distinct from new.platform then
    raise exception 'Platform row social account must belong to the same business and platform'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_content_platform_account() from public, anon, authenticated;

drop trigger if exists content_platforms_account_consistency on public.content_platforms;
create trigger content_platforms_account_consistency
  before insert or update of social_account_id, content_id, platform
  on public.content_platforms
  for each row
  execute function private.enforce_content_platform_account();
