-- Growth & Performance Intelligence Engine

-- Expand metric columns (null = unavailable from platform)
alter table public.analytics_metrics
  add column if not exists video_views integer,
  add column if not exists watch_time_seconds numeric,
  add column if not exists followers_gained integer,
  add column if not exists followers_lost integer,
  add column if not exists enquiries integer,
  add column if not exists campaign_id uuid
    references public.campaigns (id) on delete set null,
  add column if not exists product_service_id uuid
    references public.products_services (id) on delete set null,
  add column if not exists content_type text;

create index if not exists analytics_metrics_campaign_id_idx
  on public.analytics_metrics (campaign_id)
  where campaign_id is not null;
create index if not exists analytics_metrics_product_service_id_idx
  on public.analytics_metrics (product_service_id)
  where product_service_id is not null;

-- Primary goal on organisation (active goal for scoring / analysis)
alter table public.organisations
  add column if not exists primary_marketing_goal_key public.marketing_goal_key;

-- Enrich AI insights for auditability + recommendations
alter table public.ai_insights
  add column if not exists title text,
  add column if not exists explanation text,
  add column if not exists evidence text,
  add column if not exists priority text
    check (priority is null or priority in ('high', 'medium', 'low')),
  add column if not exists goal_key public.marketing_goal_key,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists related_content_id uuid
    references public.content (id) on delete set null,
  add column if not exists related_campaign_id uuid
    references public.campaigns (id) on delete set null,
  add column if not exists related_product_service_id uuid
    references public.products_services (id) on delete set null,
  add column if not exists analysis_run_id uuid;

-- Auditable analysis runs (aggregated snapshot only — never raw cross-tenant)
create table if not exists public.marketing_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  run_type text not null
    check (run_type in ('performance', 'weekly_review', 'health_score', 'recommendations')),
  period_start date not null,
  period_end date not null,
  goal_key public.marketing_goal_key,
  data_snapshot jsonb not null default '{}'::jsonb,
  summary text,
  health_score integer,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'insufficient_data')),
  model text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger marketing_analysis_runs_set_updated_at
  before update on public.marketing_analysis_runs
  for each row
  execute function private.set_updated_at();

create index marketing_analysis_runs_org_idx
  on public.marketing_analysis_runs (organisation_id, created_at desc);
create index marketing_analysis_runs_org_type_idx
  on public.marketing_analysis_runs (organisation_id, run_type);

alter table public.ai_insights
  drop constraint if exists ai_insights_analysis_run_id_fkey;
alter table public.ai_insights
  add constraint ai_insights_analysis_run_id_fkey
  foreign key (analysis_run_id)
  references public.marketing_analysis_runs (id) on delete set null;

-- Marketing health score history
create table if not exists public.marketing_health_scores (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid references public.marketing_analysis_runs (id) on delete set null,
  period_start date not null,
  period_end date not null,
  goal_key public.marketing_goal_key,
  score integer not null check (score >= 0 and score <= 100),
  previous_score integer,
  delta integer,
  components jsonb not null default '{}'::jsonb,
  main_improvement text,
  main_opportunity text,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger marketing_health_scores_set_updated_at
  before update on public.marketing_health_scores
  for each row
  execute function private.set_updated_at();

create index marketing_health_scores_org_idx
  on public.marketing_health_scores (organisation_id, created_at desc);

-- Weekly marketing reviews
create table if not exists public.marketing_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid references public.marketing_analysis_runs (id) on delete set null,
  week_start date not null,
  week_end date not null,
  goal_key public.marketing_goal_key,
  what_happened text not null,
  what_worked text not null,
  what_didnt text not null,
  what_we_learned text not null,
  what_to_do_next text not null,
  recommendations jsonb not null default '[]'::jsonb,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'insufficient_data')),
  data_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, week_start)
);

create trigger marketing_weekly_reviews_set_updated_at
  before update on public.marketing_weekly_reviews
  for each row
  execute function private.set_updated_at();

create index marketing_weekly_reviews_org_idx
  on public.marketing_weekly_reviews (organisation_id, week_start desc);

-- RLS
alter table public.marketing_analysis_runs enable row level security;
alter table public.marketing_analysis_runs force row level security;
alter table public.marketing_health_scores enable row level security;
alter table public.marketing_health_scores force row level security;
alter table public.marketing_weekly_reviews enable row level security;
alter table public.marketing_weekly_reviews force row level security;

create policy marketing_analysis_runs_select
  on public.marketing_analysis_runs for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_analysis_runs_insert
  on public.marketing_analysis_runs for insert to authenticated
  with check (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_health_scores_select
  on public.marketing_health_scores for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_health_scores_insert
  on public.marketing_health_scores for insert to authenticated
  with check (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_weekly_reviews_select
  on public.marketing_weekly_reviews for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_weekly_reviews_insert
  on public.marketing_weekly_reviews for insert to authenticated
  with check (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy marketing_weekly_reviews_update
  on public.marketing_weekly_reviews for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert on public.marketing_analysis_runs to authenticated;
grant select, insert on public.marketing_health_scores to authenticated;
grant select, insert, update on public.marketing_weekly_reviews to authenticated;

-- Improve demo seed: category-aware, richer metrics (still labelled demo)
create or replace function private.create_organisation(
  p_name text,
  p_slug text,
  p_business_category text default null,
  p_description text default null,
  p_location text default null,
  p_website text default null,
  p_booking_url text default null,
  p_phone text default null,
  p_email text default null,
  p_opening_hours jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_day date;
  v_i integer;
  v_platform public.social_platform;
  v_mult numeric := 1.0;
  v_goal public.marketing_goal_key := 'increase_bookings';
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organisation name is required';
  end if;

  if p_slug is null or length(trim(p_slug)) = 0 then
    raise exception 'Organisation slug is required';
  end if;

  -- Category-aware demo intensity (hair vs restaurant etc.)
  if lower(coalesce(p_business_category, '')) like '%restaurant%'
     or lower(coalesce(p_business_category, '')) like '%food%' then
    v_mult := 0.75;
    v_goal := 'increase_enquiries';
  elsif lower(coalesce(p_business_category, '')) like '%hair%'
     or lower(coalesce(p_business_category, '')) like '%beauty%'
     or lower(coalesce(p_business_category, '')) like '%barber%' then
    v_mult := 1.35;
    v_goal := 'increase_bookings';
  elsif lower(coalesce(p_business_category, '')) like '%fitness%' then
    v_mult := 1.1;
    v_goal := 'increase_followers';
  end if;

  insert into public.organisations (
    name,
    slug,
    business_category,
    description,
    location,
    website,
    booking_url,
    phone,
    email,
    opening_hours,
    created_by,
    primary_marketing_goal_key
  )
  values (
    trim(p_name),
    lower(trim(p_slug)),
    p_business_category,
    p_description,
    p_location,
    p_website,
    p_booking_url,
    p_phone,
    p_email,
    p_opening_hours,
    v_user_id,
    v_goal
  )
  returning id into v_org_id;

  insert into public.organisation_members (organisation_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.brand_profiles (organisation_id)
  values (v_org_id);

  insert into public.marketing_goals (
    organisation_id, goal_key, title, status
  ) values (
    v_org_id, v_goal, initcap(replace(v_goal::text, '_', ' ')), 'active'
  );

  insert into public.social_accounts (organisation_id, platform, connection_status)
  values
    (v_org_id, 'instagram', 'not_connected'),
    (v_org_id, 'facebook', 'not_connected'),
    (v_org_id, 'tiktok', 'not_connected');

  for v_platform in
    select unnest(array['instagram', 'facebook', 'tiktok']::public.social_platform[])
  loop
    for v_i in 0..29 loop
      v_day := (current_date - (29 - v_i));
      insert into public.analytics_metrics (
        organisation_id,
        platform,
        metric_date,
        reach,
        impressions,
        likes,
        comments,
        shares,
        saves,
        profile_visits,
        link_clicks,
        bookings,
        enquiries,
        revenue_attributed,
        video_views,
        watch_time_seconds,
        followers_gained,
        followers_lost,
        source
      )
      values (
        v_org_id,
        v_platform,
        v_day,
        round((400 + v_i * 40 + case v_platform when 'instagram' then 200 when 'tiktok' then 280 else 80 end) * v_mult),
        round((800 + v_i * 70 + case v_platform when 'instagram' then 300 when 'tiktok' then 450 else 120 end) * v_mult),
        round((12 + v_i + case v_platform when 'tiktok' then 8 else 2 end) * v_mult),
        round((2 + (v_i % 5) + case v_platform when 'instagram' then 2 else 0 end) * v_mult),
        round((1 + (v_i % 3)) * v_mult),
        round((3 + (v_i % 4) + case v_platform when 'instagram' then 4 else 0 end) * v_mult),
        round((15 + v_i * 2 + case v_platform when 'instagram' then 10 else 3 end) * v_mult),
        round((8 + v_i + case v_platform when 'facebook' then 4 else 1 end) * v_mult),
        case when v_i % 4 = 0 then greatest(1, round(1 * v_mult)) else 0 end,
        case when v_i % 5 = 0 then greatest(1, round(1 * v_mult)) else 0 end,
        round((25 + v_i * 8) * v_mult, 2),
        case when v_platform in ('tiktok', 'instagram')
          then round((500 + v_i * 90) * v_mult) else null end,
        case when v_platform in ('tiktok', 'instagram')
          then round((1200 + v_i * 40) * v_mult, 1) else null end,
        case when v_i % 2 = 0 then greatest(1, round((2 + (v_i % 6)) * v_mult)) else 0 end,
        case when v_i % 7 = 0 then 1 else 0 end,
        'demo'
      );
    end loop;
  end loop;

  insert into public.audit_logs (
    organisation_id, user_id, action, entity_type, entity_id, metadata
  ) values (
    v_org_id, v_user_id, 'organisation.created', 'organisations', v_org_id,
    jsonb_build_object('name', trim(p_name), 'demo_analytics', true)
  );

  return v_org_id;
end;
$$;

comment on table public.marketing_analysis_runs is
  'Org-scoped AI analysis audit trail. Snapshots are aggregated; never cross-tenant.';
comment on table public.marketing_health_scores is
  'Transparent marketing health scores per organisation and period.';
comment on table public.marketing_weekly_reviews is
  'AI weekly marketing reviews used to improve the next content plan.';
