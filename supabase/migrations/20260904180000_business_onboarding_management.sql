-- Business onboarding & multi-business management

alter table public.organisations
  add column if not exists country text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_step text not null default 'business',
  add column if not exists onboarding_skipped jsonb not null default '[]'::jsonb;

alter table public.brand_profiles
  add column if not exists custom_instructions text;

-- Audience profile (1:1 with organisation)
create table if not exists public.audience_profiles (
  organisation_id uuid primary key
    references public.organisations (id) on delete cascade,
  age_range text,
  location_focus text,
  interests text[] not null default '{}',
  customer_types text[] not null default '{}',
  income_lifestyle text,
  ideal_customer_description text,
  additional_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger audience_profiles_set_updated_at
  before update on public.audience_profiles
  for each row
  execute function private.set_updated_at();

alter table public.audience_profiles enable row level security;
alter table public.audience_profiles force row level security;

create policy audience_profiles_select
  on public.audience_profiles for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy audience_profiles_insert
  on public.audience_profiles for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy audience_profiles_update
  on public.audience_profiles for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy audience_profiles_delete
  on public.audience_profiles for delete to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert, update, delete on public.audience_profiles to authenticated;

-- Team invites (foundation — email invite acceptance can be expanded later)
create table if not exists public.organisation_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'staff',
  invited_by uuid references public.users (id) on delete set null,
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Allow multiple historical invites; unique pending per email via partial index
create unique index if not exists organisation_invites_pending_email_idx
  on public.organisation_invites (organisation_id, lower(email))
  where status = 'pending';

create trigger organisation_invites_set_updated_at
  before update on public.organisation_invites
  for each row
  execute function private.set_updated_at();

alter table public.organisation_invites enable row level security;
alter table public.organisation_invites force row level security;

create policy organisation_invites_select
  on public.organisation_invites for select to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy organisation_invites_insert_owner
  on public.organisation_invites for insert to authenticated
  with check (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

create policy organisation_invites_update_owner
  on public.organisation_invites for update to authenticated
  using (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  )
  with check (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

create policy organisation_invites_delete_owner
  on public.organisation_invites for delete to authenticated
  using (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

grant select, insert, update, delete on public.organisation_invites to authenticated;

-- Seed audience profile when org is created (extend create_organisation)
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
    primary_marketing_goal_key,
    onboarding_step
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
    v_goal,
    'brand'
  )
  returning id into v_org_id;

  insert into public.organisation_members (organisation_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.brand_profiles (organisation_id)
  values (v_org_id);

  insert into public.audience_profiles (organisation_id)
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

-- Backfill audience profiles for existing orgs
insert into public.audience_profiles (organisation_id)
select id from public.organisations o
where not exists (
  select 1 from public.audience_profiles a where a.organisation_id = o.id
);

comment on table public.audience_profiles is
  'Ideal customer / audience profile per organisation for AI context.';
comment on table public.organisation_invites is
  'Pending team invitations. Owners invite; accept flow can expand later.';
