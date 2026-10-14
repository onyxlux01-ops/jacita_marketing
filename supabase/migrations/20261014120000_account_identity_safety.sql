-- =============================================================================
-- Account identity safety (blocks merging the per-org Meta app branch).
--
-- A queued job records which external account (Page / IG user) it was
-- approved for. If the business switches its connected account, queued jobs
-- are held (`held`, hold_reason ACCOUNT_CHANGED) and the worker refuses any
-- job whose recorded target no longer matches the account's current
-- external id — so a post approved for one Page can never go out on another.
-- =============================================================================

alter table public.social_publish_jobs
  add column if not exists target_external_account_id text;

comment on column public.social_publish_jobs.target_external_account_id is
  'social_accounts.external_account_id at queue time. The worker holds the job (ACCOUNT_CHANGED) if the account now points elsewhere.';

-- Backfill active jobs with the account they would publish to today.
update public.social_publish_jobs j
set target_external_account_id = a.external_account_id
from public.social_accounts a
where a.id = j.social_account_id
  and j.target_external_account_id is null
  and j.status in ('pending', 'ready', 'retrying', 'processing', 'held');
