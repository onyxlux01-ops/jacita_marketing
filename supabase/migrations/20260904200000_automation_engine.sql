-- In-house AI marketing automation engine

create table if not exists public.automation_settings (
  organisation_id uuid primary key
    references public.organisations (id) on delete cascade,
  enabled boolean not null default false,
  paused boolean not null default false,
  mode text not null default 'off'
    check (mode in ('off', 'manual', 'approval', 'autopilot')),
  posts_per_week integer not null default 5 check (posts_per_week between 0 and 28),
  stories_per_week integer not null default 0 check (stories_per_week between 0 and 28),
  reels_per_week integer not null default 2 check (reels_per_week between 0 and 21),
  platforms text[] not null default array['instagram','facebook','tiktok']::text[],
  content_preferences text[] not null default array[
    'promotional','educational','engagement','brand_awareness',
    'behind_the_scenes','services','community'
  ]::text[],
  primary_goals text[] not null default array['increase_brand_awareness']::text[],
  quiet_hours jsonb not null default '{"start":"22:00","end":"08:00"}'::jsonb,
  max_auto_publishes_per_day integer not null default 3
    check (max_auto_publishes_per_day between 0 and 20),
  pipeline_horizon_days integer not null default 7
    check (pipeline_horizon_days between 3 and 21),
  current_state text not null default 'off'
    check (current_state in (
      'off','starting','analysing','planning','creating','validating',
      'scheduling','publishing','learning','paused','error','completed'
    )),
  state_message text,
  setup_completed_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger automation_settings_set_updated_at
  before update on public.automation_settings
  for each row
  execute function private.set_updated_at();

alter table public.automation_settings enable row level security;
alter table public.automation_settings force row level security;

create policy automation_settings_select
  on public.automation_settings for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy automation_settings_upsert
  on public.automation_settings for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy automation_settings_update
  on public.automation_settings for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert, update on public.automation_settings to authenticated;

-- Runs
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trigger text not null default 'cron'
    check (trigger in ('cron', 'manual', 'start', 'resume')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'paused', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  actions_taken integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_runs_org_started_idx
  on public.automation_runs (organisation_id, started_at desc);

alter table public.automation_runs enable row level security;
alter table public.automation_runs force row level security;

create policy automation_runs_select
  on public.automation_runs for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy automation_runs_insert
  on public.automation_runs for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy automation_runs_update
  on public.automation_runs for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert, update on public.automation_runs to authenticated;

-- Tasks
create table if not exists public.automation_tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  run_id uuid references public.automation_runs (id) on delete cascade,
  task_type text not null
    check (task_type in (
      'strategy_update',
      'content_generation',
      'media_selection',
      'content_validation',
      'schedule_post',
      'publish_post',
      'performance_analysis',
      'pipeline_check'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
  content_id uuid references public.content (id) on delete set null,
  decision jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automation_tasks_run_idx
  on public.automation_tasks (run_id, created_at);
create index if not exists automation_tasks_org_status_idx
  on public.automation_tasks (organisation_id, status);

alter table public.automation_tasks enable row level security;
alter table public.automation_tasks force row level security;

create policy automation_tasks_select
  on public.automation_tasks for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy automation_tasks_insert
  on public.automation_tasks for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy automation_tasks_update
  on public.automation_tasks for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert, update on public.automation_tasks to authenticated;

-- Activity feed
create table if not exists public.automation_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  run_id uuid references public.automation_runs (id) on delete set null,
  event_type text not null,
  message text not null,
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_activity_org_idx
  on public.automation_activity (organisation_id, created_at desc);

alter table public.automation_activity enable row level security;
alter table public.automation_activity force row level security;

create policy automation_activity_select
  on public.automation_activity for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy automation_activity_insert
  on public.automation_activity for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert on public.automation_activity to authenticated;

-- Seed settings for existing orgs
insert into public.automation_settings (organisation_id, mode, enabled)
select o.id,
  case o.autopilot_mode
    when 'autopilot' then 'autopilot'
    when 'approval_required' then 'approval'
    else 'manual'
  end,
  false
from public.organisations o
where not exists (
  select 1 from public.automation_settings s where s.organisation_id = o.id
);

comment on table public.automation_settings is
  'Per-business marketing automation controls for the in-house autopilot engine.';
comment on table public.automation_runs is
  'One record per automation execution (cron or manual start).';
comment on table public.automation_tasks is
  'Typed steps within an automation run.';
comment on table public.automation_activity is
  'Human-readable feed of what automation is doing.';
