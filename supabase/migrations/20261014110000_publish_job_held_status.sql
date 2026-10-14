-- Add a `held` publish job status (its own migration: a new enum value
-- cannot be used in the same transaction that adds it).
--
-- social_publish_jobs.status is the enum public.publish_job_status (not
-- text), and there is no CHECK constraint on it; the only status-dependent
-- objects are the partial indexes social_publish_jobs_active_unique
-- (pending/ready/processing/retrying), _due_idx and _retry_idx. `held` is
-- deliberately NOT an active status, so a held job never blocks re-queueing
-- and is never picked up by the cron worker.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'publish_job_status' and e.enumlabel = 'held'
  ) then
    alter type public.publish_job_status add value 'held';
  end if;
end $$;
