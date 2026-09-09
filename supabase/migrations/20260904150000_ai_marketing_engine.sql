-- AI Marketing Engine tables (org-scoped + RLS)

create type public.marketing_goal_key as enum (
  'increase_bookings',
  'promote_service',
  'increase_followers',
  'increase_engagement',
  'increase_brand_awareness',
  'promote_new_service',
  'fill_quiet_periods',
  'promote_seasonal_offer',
  'increase_website_traffic',
  'increase_enquiries',
  'increase_repeat_customers'
);

create type public.ai_generation_type as enum (
  'assistant',
  'strategy',
  'content',
  'weekly_plan',
  'campaign',
  'media_recommend',
  'insights',
  'validation'
);

create type public.ai_generation_status as enum (
  'success',
  'fallback',
  'failed'
);

-- marketing_goals
create table public.marketing_goals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  goal_key public.marketing_goal_key not null,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  target_metric text,
  product_service_id uuid references public.products_services (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger marketing_goals_set_updated_at
  before update on public.marketing_goals
  for each row
  execute function private.set_updated_at();

create index marketing_goals_organisation_id_idx
  on public.marketing_goals (organisation_id);
create index marketing_goals_org_status_idx
  on public.marketing_goals (organisation_id, status);

-- marketing_strategies
create table public.marketing_strategies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  marketing_goal_id uuid references public.marketing_goals (id) on delete set null,
  title text not null,
  primary_objective text not null,
  target_audience text,
  key_message text,
  services_to_promote jsonb not null default '[]'::jsonb,
  content_themes jsonb not null default '[]'::jsonb,
  recommended_platforms jsonb not null default '[]'::jsonb,
  recommended_content_types jsonb not null default '[]'::jsonb,
  posting_frequency text,
  campaign_duration text,
  calls_to_action jsonb not null default '[]'::jsonb,
  content_mix jsonb not null default '{}'::jsonb,
  strategy_payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger marketing_strategies_set_updated_at
  before update on public.marketing_strategies
  for each row
  execute function private.set_updated_at();

create index marketing_strategies_organisation_id_idx
  on public.marketing_strategies (organisation_id);
create index marketing_strategies_goal_id_idx
  on public.marketing_strategies (marketing_goal_id);

-- link content + campaigns to strategies (optional)
alter table public.content
  add column if not exists marketing_strategy_id uuid
    references public.marketing_strategies (id) on delete set null;

alter table public.content
  add column if not exists marketing_goal_id uuid
    references public.marketing_goals (id) on delete set null;

alter table public.campaigns
  add column if not exists marketing_strategy_id uuid
    references public.marketing_strategies (id) on delete set null;

alter table public.campaigns
  add column if not exists marketing_goal_id uuid
    references public.marketing_goals (id) on delete set null;

alter table public.campaigns
  add column if not exists key_message text;

alter table public.campaigns
  add column if not exists content_themes jsonb default '[]'::jsonb;

create index if not exists content_marketing_strategy_id_idx
  on public.content (marketing_strategy_id);
create index if not exists content_marketing_goal_id_idx
  on public.content (marketing_goal_id);

-- ai_generations history
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  generation_type public.ai_generation_type not null,
  request_text text,
  input_context jsonb not null default '{}'::jsonb,
  output_payload jsonb,
  status public.ai_generation_status not null default 'success',
  error_message text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_generations_set_updated_at
  before update on public.ai_generations
  for each row
  execute function private.set_updated_at();

create index ai_generations_organisation_id_idx
  on public.ai_generations (organisation_id);
create index ai_generations_org_type_idx
  on public.ai_generations (organisation_id, generation_type);
create index ai_generations_created_at_idx
  on public.ai_generations (organisation_id, created_at desc);

-- ai_insights
create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  insight_text text not null,
  insight_type text not null default 'recommendation',
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high', 'insufficient_data')),
  based_on jsonb not null default '{}'::jsonb,
  action_label text,
  action_href text,
  is_active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_insights_set_updated_at
  before update on public.ai_insights
  for each row
  execute function private.set_updated_at();

create index ai_insights_organisation_id_idx
  on public.ai_insights (organisation_id);
create index ai_insights_org_active_idx
  on public.ai_insights (organisation_id, is_active);

-- RLS
alter table public.marketing_goals enable row level security;
alter table public.marketing_goals force row level security;
alter table public.marketing_strategies enable row level security;
alter table public.marketing_strategies force row level security;
alter table public.ai_generations enable row level security;
alter table public.ai_generations force row level security;
alter table public.ai_insights enable row level security;
alter table public.ai_insights force row level security;

create policy marketing_goals_select
  on public.marketing_goals for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_goals_insert
  on public.marketing_goals for insert to authenticated
  with check (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_goals_update
  on public.marketing_goals for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy marketing_goals_delete
  on public.marketing_goals for delete to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy marketing_strategies_select
  on public.marketing_strategies for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_strategies_insert
  on public.marketing_strategies for insert to authenticated
  with check (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_strategies_update
  on public.marketing_strategies for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy marketing_strategies_delete
  on public.marketing_strategies for delete to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy ai_generations_select
  on public.ai_generations for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy ai_generations_insert
  on public.ai_generations for insert to authenticated
  with check (
    (
      private.is_org_member(organisation_id)
      and user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

-- generations are append-only for members
create policy ai_generations_update_admin
  on public.ai_generations for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create policy ai_insights_select
  on public.ai_insights for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy ai_insights_insert
  on public.ai_insights for insert to authenticated
  with check (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy ai_insights_update
  on public.ai_insights for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy ai_insights_delete
  on public.ai_insights for delete to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert, update, delete on public.marketing_goals to authenticated;
grant select, insert, update, delete on public.marketing_strategies to authenticated;
grant select, insert on public.ai_generations to authenticated;
grant select, insert, update, delete on public.ai_insights to authenticated;
