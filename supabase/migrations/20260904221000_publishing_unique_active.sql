-- Extend unique active-job index now that new enum values exist
drop index if exists public.social_publish_jobs_active_unique;

with ranked as (
  select id,
    row_number() over (
      partition by content_id, social_account_id
      order by created_at desc
    ) as rn
  from public.social_publish_jobs
  where status in ('pending', 'ready', 'processing', 'retrying')
)
update public.social_publish_jobs j
set status = 'cancelled',
    error_message = 'Cancelled duplicate active job'
from ranked r
where j.id = r.id and r.rn > 1;

create unique index social_publish_jobs_active_unique
  on public.social_publish_jobs (content_id, social_account_id)
  where status in ('pending', 'ready', 'processing', 'retrying');

create index if not exists social_publish_jobs_retry_idx
  on public.social_publish_jobs (status, next_retry_at)
  where status = 'retrying';
