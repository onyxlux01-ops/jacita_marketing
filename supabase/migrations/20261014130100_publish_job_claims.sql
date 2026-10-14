-- =============================================================================
-- Job claims and crash recovery (audit findings 4 and 7).
--
-- * claim_publish_job(): one atomic UPDATE ... RETURNING that moves a job
--   from an allowed state to `processing` with a fresh lock token. A job that
--   is already `processing` can never be claimed (or reset) by anyone else.
-- * request_sent_at: set (under the lock) right before the provider request.
--   Lets crash recovery tell "never sent" (safe to retry) from "outcome
--   unknown" (-> `uncertain`, held for review).
-- * Only server code (service role) and RPCs write publish jobs: browser
--   sessions lose INSERT/UPDATE/DELETE.
-- =============================================================================

alter table public.social_publish_jobs
  add column if not exists request_sent_at timestamptz;

comment on column public.social_publish_jobs.request_sent_at is
  'Set under the job lock just before the provider publish request. A stale processing job with this set has an unknown outcome (uncertain), not a safe retry.';

create or replace function public.claim_publish_job(
  p_job_id uuid,
  p_lock_token text,
  p_allowed_states public.publish_job_status[]
)
returns setof public.social_publish_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lock_token is null or length(p_lock_token) < 16 then
    raise exception 'A lock token of at least 16 characters is required'
      using errcode = '22023';
  end if;
  if 'processing'::public.publish_job_status = any (p_allowed_states)
     or 'published'::public.publish_job_status = any (p_allowed_states) then
    raise exception 'processing/published jobs cannot be claimed'
      using errcode = '22023';
  end if;

  return query
  update public.social_publish_jobs j
  set status = 'processing',
      locked_at = now(),
      lock_token = p_lock_token,
      last_attempt_at = now(),
      attempt_count = j.attempt_count + 1,
      request_sent_at = null
  where j.id = p_job_id
    and j.status = any (p_allowed_states)
  returning j.*;
end;
$$;

revoke all on function public.claim_publish_job(uuid, text, public.publish_job_status[])
  from public, anon, authenticated;
grant execute on function public.claim_publish_job(uuid, text, public.publish_job_status[])
  to service_role;

comment on function public.claim_publish_job(uuid, text, public.publish_job_status[]) is
  'Atomically claim a publish job (allowed state -> processing, new lock token). Returns the row, or nothing if another worker holds it / it is not claimable. Service role only.';

-- Browser sessions may read their business's jobs but never write them.
drop policy if exists social_publish_jobs_insert_manager on public.social_publish_jobs;
drop policy if exists social_publish_jobs_update_manager on public.social_publish_jobs;
drop policy if exists social_publish_jobs_delete_manager on public.social_publish_jobs;
revoke insert, update, delete on public.social_publish_jobs from authenticated, anon;
grant select on public.social_publish_jobs to authenticated;
grant all on public.social_publish_jobs to service_role;
