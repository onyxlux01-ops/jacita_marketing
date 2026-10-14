-- `uncertain`: a worker died after the provider request may have been sent
-- and before the outcome was stored. The post may be live; never retried
-- automatically — a person checks the platform and decides.
-- (Own migration: a new enum value can't be used in the transaction that adds it.)
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'publish_job_status' and e.enumlabel = 'uncertain'
  ) then
    alter type public.publish_job_status add value 'uncertain';
  end if;
end $$;
