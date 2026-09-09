-- =============================================================================
-- Jacita Marketing — multi-tenant foundation schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Private schema (security definer helpers)
-- -----------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;
-- Authenticated needs USAGE only so RLS policies can resolve private.* helpers;
-- individual function EXECUTE is granted narrowly below.
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Enums
-- -----------------------------------------------------------------------------
create type public.organisation_status as enum ('active', 'disabled', 'trial');
create type public.autopilot_mode as enum ('manual', 'approval_required', 'autopilot');
create type public.org_role as enum ('owner', 'manager', 'staff');
create type public.social_platform as enum ('instagram', 'facebook', 'tiktok');
create type public.connection_status as enum ('connected', 'not_connected', 'expired', 'error');
create type public.media_type as enum ('image', 'video');
create type public.content_status as enum (
  'draft',
  'review',
  'approved',
  'scheduled',
  'published',
  'failed'
);
create type public.campaign_status as enum (
  'draft',
  'active',
  'paused',
  'completed',
  'archived'
);

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger (private)
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Tables
-- -----------------------------------------------------------------------------

-- users (extends auth.users; platform admin is a column, NOT user_metadata)
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function private.set_updated_at();

-- Prevent non-admins from escalating is_platform_admin (column, not user_metadata)
create or replace function private.protect_platform_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    if not exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and u.is_platform_admin = true
    ) then
      raise exception 'Only platform admins can change is_platform_admin';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_platform_admin_flag() from public, anon, authenticated;

create trigger users_protect_platform_admin
  before update on public.users
  for each row
  execute function private.protect_platform_admin_flag();

-- organisations
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- Flexible category (not salon-only). Examples: Hair & Beauty, Barber,
  -- Restaurant, Retail, Cleaning, Fitness, Professional Services, Other
  business_category text,
  description text,
  location text,
  website text,
  booking_url text,
  phone text,
  email text,
  opening_hours jsonb,
  logo_path text,
  status public.organisation_status not null default 'trial',
  plan text not null default 'free',
  subscription_status text, -- nullable; reserved for future billing
  autopilot_mode public.autopilot_mode not null default 'manual',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.organisations.business_category is
  'Flexible business category text. Examples: Hair & Beauty, Barber, Restaurant, Retail, Cleaning, Fitness, Professional Services, Other. Not limited to salons.';

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row
  execute function private.set_updated_at();

-- organisation_members
create table public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.org_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create trigger organisation_members_set_updated_at
  before update on public.organisation_members
  for each row
  execute function private.set_updated_at();

-- brand_profiles (1:1 with organisation)
create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations (id) on delete cascade,
  logo_path text,
  primary_color text,
  secondary_color text,
  typography_preferences jsonb,
  brand_voice text,
  tone text,
  target_audience text,
  business_description text,
  marketing_objectives text,
  preferred_terminology text,
  words_to_avoid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brand_profiles_set_updated_at
  before update on public.brand_profiles
  for each row
  execute function private.set_updated_at();

-- products_services
create table public.products_services (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  description text,
  category text,
  price numeric,
  duration_minutes integer,
  target_audience text,
  is_featured boolean not null default false,
  is_promotion boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger products_services_set_updated_at
  before update on public.products_services
  for each row
  execute function private.set_updated_at();

-- social_accounts (NEVER store raw OAuth tokens — use token_vault_ref only)
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  platform public.social_platform not null,
  account_name text,
  account_handle text,
  connection_status public.connection_status not null default 'not_connected',
  external_account_id text,
  token_vault_ref text, -- nullable; vault reference only — never raw OAuth tokens
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, platform)
);

create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row
  execute function private.set_updated_at();

-- media_assets
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  storage_path text not null,
  file_url text,
  thumbnail_url text,
  media_type public.media_type not null,
  category text,
  tags text[] not null default '{}',
  description text,
  usage_count integer not null default 0,
  is_favourite boolean not null default false,
  is_active boolean not null default true,
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row
  execute function private.set_updated_at();

-- campaigns (before content — content may reference campaign_id)
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  objective text,
  description text,
  start_date date,
  end_date date,
  target_audience text,
  budget numeric,
  status public.campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row
  execute function private.set_updated_at();

-- content
create table public.content (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  product_service_id uuid references public.products_services (id) on delete set null,
  media_asset_id uuid references public.media_assets (id) on delete set null,
  title text,
  idea text,
  hook text,
  caption text,
  call_to_action text,
  hashtags text[] not null default '{}',
  suggested_posting_time timestamptz,
  video_concept text,
  content_type text,
  marketing_objective text,
  tone text,
  status public.content_status not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  generation_payload jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_set_updated_at
  before update on public.content
  for each row
  execute function private.set_updated_at();

-- content_platforms
create table public.content_platforms (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  platform public.social_platform not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, platform)
);

create trigger content_platforms_set_updated_at
  before update on public.content_platforms
  for each row
  execute function private.set_updated_at();

-- content_tags
create table public.content_tags (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, tag)
);

create trigger content_tags_set_updated_at
  before update on public.content_tags
  for each row
  execute function private.set_updated_at();

-- campaign_products_services
create table public.campaign_products_services (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  product_service_id uuid not null references public.products_services (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, product_service_id)
);

create trigger campaign_products_services_set_updated_at
  before update on public.campaign_products_services
  for each row
  execute function private.set_updated_at();

-- analytics_metrics
create table public.analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  platform public.social_platform not null,
  metric_date date not null,
  reach integer not null default 0,
  impressions integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  profile_visits integer not null default 0,
  link_clicks integer not null default 0,
  bookings integer not null default 0,
  revenue_attributed numeric not null default 0,
  source text not null default 'demo' check (source in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger analytics_metrics_set_updated_at
  before update on public.analytics_metrics
  for each row
  execute function private.set_updated_at();

-- audit_logs (organisation_id nullable for platform-level events)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger audit_logs_set_updated_at
  before update on public.audit_logs
  for each row
  execute function private.set_updated_at();

-- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  organisation_id uuid references public.organisations (id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row
  execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Indexes (organisation_id + RLS-relevant columns)
-- -----------------------------------------------------------------------------
create index organisation_members_organisation_id_idx
  on public.organisation_members (organisation_id);
create index organisation_members_user_id_idx
  on public.organisation_members (user_id);
create index organisation_members_user_org_idx
  on public.organisation_members (user_id, organisation_id);

create index brand_profiles_organisation_id_idx
  on public.brand_profiles (organisation_id);

create index products_services_organisation_id_idx
  on public.products_services (organisation_id);
create index products_services_org_active_idx
  on public.products_services (organisation_id, is_active);

create index social_accounts_organisation_id_idx
  on public.social_accounts (organisation_id);

create index media_assets_organisation_id_idx
  on public.media_assets (organisation_id);
create index media_assets_uploaded_by_idx
  on public.media_assets (uploaded_by);
create index media_assets_org_active_idx
  on public.media_assets (organisation_id, is_active);

create index campaigns_organisation_id_idx
  on public.campaigns (organisation_id);
create index campaigns_org_status_idx
  on public.campaigns (organisation_id, status);

create index content_organisation_id_idx
  on public.content (organisation_id);
create index content_campaign_id_idx
  on public.content (campaign_id);
create index content_product_service_id_idx
  on public.content (product_service_id);
create index content_media_asset_id_idx
  on public.content (media_asset_id);
create index content_created_by_idx
  on public.content (created_by);
create index content_org_status_idx
  on public.content (organisation_id, status);
create index content_scheduled_at_idx
  on public.content (scheduled_at)
  where scheduled_at is not null;

create index content_platforms_content_id_idx
  on public.content_platforms (content_id);

create index content_tags_content_id_idx
  on public.content_tags (content_id);

create index campaign_products_services_campaign_id_idx
  on public.campaign_products_services (campaign_id);
create index campaign_products_services_product_service_id_idx
  on public.campaign_products_services (product_service_id);

create index analytics_metrics_organisation_id_idx
  on public.analytics_metrics (organisation_id);
create index analytics_metrics_content_id_idx
  on public.analytics_metrics (content_id);
create index analytics_metrics_org_date_idx
  on public.analytics_metrics (organisation_id, metric_date);
create index analytics_metrics_org_platform_date_idx
  on public.analytics_metrics (organisation_id, platform, metric_date);

create index audit_logs_organisation_id_idx
  on public.audit_logs (organisation_id);
create index audit_logs_user_id_idx
  on public.audit_logs (user_id);
create index audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index notifications_user_id_idx
  on public.notifications (user_id);
create index notifications_organisation_id_idx
  on public.notifications (organisation_id);
create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create index users_is_platform_admin_idx
  on public.users (is_platform_admin)
  where is_platform_admin = true;

create index organisations_created_by_idx
  on public.organisations (created_by);
create index organisations_status_idx
  on public.organisations (status);

-- -----------------------------------------------------------------------------
-- 6. Auth user → public.users sync
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- 7. RLS helper functions (private)
-- -----------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_platform_admin = true
  );
$$;

create or replace function private.is_org_member(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_org_role(p_organisation_id uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create or replace function private.can_manage_org(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(
    p_organisation_id,
    array['owner', 'manager']::public.org_role[]
  );
$$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, public.org_role[]) from public, anon, authenticated;
revoke all on function private.can_manage_org(uuid) from public, anon, authenticated;

-- Allow authenticated to execute helpers used in RLS (via policies evaluated as invoker;
-- SECURITY DEFINER still runs as owner). Grant execute so policy expressions resolve.
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function private.can_manage_org(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. create_organisation (private impl + public thin wrapper)
-- -----------------------------------------------------------------------------
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
    created_by
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
    v_user_id
  )
  returning id into v_org_id;

  insert into public.organisation_members (organisation_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.brand_profiles (organisation_id)
  values (v_org_id);

  insert into public.social_accounts (organisation_id, platform, connection_status)
  values
    (v_org_id, 'instagram', 'not_connected'),
    (v_org_id, 'facebook', 'not_connected'),
    (v_org_id, 'tiktok', 'not_connected');

  insert into public.audit_logs (
    organisation_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_org_id,
    v_user_id,
    'organisation.created',
    'organisation',
    v_org_id,
    jsonb_build_object('name', trim(p_name), 'slug', lower(trim(p_slug)))
  );

  return v_org_id;
end;
$$;

revoke all on function private.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.create_organisation(
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
language sql
security definer
set search_path = ''
as $$
  select private.create_organisation(
    p_name,
    p_slug,
    p_business_category,
    p_description,
    p_location,
    p_website,
    p_booking_url,
    p_phone,
    p_email,
    p_opening_hours
  );
$$;

revoke all on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Force RLS + policies
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.users force row level security;
alter table public.organisations enable row level security;
alter table public.organisations force row level security;
alter table public.organisation_members enable row level security;
alter table public.organisation_members force row level security;
alter table public.brand_profiles enable row level security;
alter table public.brand_profiles force row level security;
alter table public.products_services enable row level security;
alter table public.products_services force row level security;
alter table public.social_accounts enable row level security;
alter table public.social_accounts force row level security;
alter table public.media_assets enable row level security;
alter table public.media_assets force row level security;
alter table public.content enable row level security;
alter table public.content force row level security;
alter table public.content_platforms enable row level security;
alter table public.content_platforms force row level security;
alter table public.content_tags enable row level security;
alter table public.content_tags force row level security;
alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;
alter table public.campaign_products_services enable row level security;
alter table public.campaign_products_services force row level security;
alter table public.analytics_metrics enable row level security;
alter table public.analytics_metrics force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- ---- users ----
create policy users_select_own_or_admin
  on public.users
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.is_platform_admin()
  );

create policy users_update_own
  on public.users
  for update
  to authenticated
  using (id = (select auth.uid()) or private.is_platform_admin())
  with check (id = (select auth.uid()) or private.is_platform_admin());

-- Members can see fellow org members' profiles
create policy users_select_org_peers
  on public.users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organisation_members me
      join public.organisation_members peer
        on peer.organisation_id = me.organisation_id
      where me.user_id = (select auth.uid())
        and peer.user_id = users.id
    )
  );

-- ---- organisations ----
create policy organisations_select_member_or_admin
  on public.organisations
  for select
  to authenticated
  using (
    private.is_org_member(id)
    or private.is_platform_admin()
  );

create policy organisations_update_manager_or_admin
  on public.organisations
  for update
  to authenticated
  using (
    private.can_manage_org(id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(id)
    or private.is_platform_admin()
  );

create policy organisations_delete_owner_or_admin
  on public.organisations
  for delete
  to authenticated
  using (
    private.has_org_role(id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

-- Inserts go through create_organisation(); no direct insert for authenticated

-- ---- organisation_members ----
create policy organisation_members_select
  on public.organisation_members
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy organisation_members_insert_manager
  on public.organisation_members
  for insert
  to authenticated
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy organisation_members_update_manager
  on public.organisation_members
  for update
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy organisation_members_delete_manager
  on public.organisation_members
  for delete
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- brand_profiles ----
create policy brand_profiles_select
  on public.brand_profiles
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy brand_profiles_update_manager
  on public.brand_profiles
  for update
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- Inserts created by create_organisation(); managers may also insert if missing
create policy brand_profiles_insert_manager
  on public.brand_profiles
  for insert
  to authenticated
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- products_services ----
create policy products_services_select
  on public.products_services
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy products_services_insert_manager
  on public.products_services
  for insert
  to authenticated
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy products_services_update_manager
  on public.products_services
  for update
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy products_services_delete_manager
  on public.products_services
  for delete
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- social_accounts ----
create policy social_accounts_select
  on public.social_accounts
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy social_accounts_update_manager
  on public.social_accounts
  for update
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy social_accounts_insert_manager
  on public.social_accounts
  for insert
  to authenticated
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- media_assets ----
create policy media_assets_select
  on public.media_assets
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

-- Staff+ can upload media
create policy media_assets_insert_member
  on public.media_assets
  for insert
  to authenticated
  with check (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy media_assets_update_member
  on public.media_assets
  for update
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy media_assets_delete_manager
  on public.media_assets
  for delete
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- content ----
create policy content_select
  on public.content
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

-- Staff+ can create drafts
create policy content_insert_member
  on public.content
  for insert
  to authenticated
  with check (
    (
      private.is_org_member(organisation_id)
      and status = 'draft'
    )
    or private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- Staff can update drafts they created; manager+ can approve/schedule/update any
create policy content_update_staff_drafts
  on public.content
  for update
  to authenticated
  using (
    (
      private.is_org_member(organisation_id)
      and status = 'draft'
      and created_by = (select auth.uid())
    )
    or private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    (
      private.is_org_member(organisation_id)
      and status in ('draft', 'review')
      and created_by = (select auth.uid())
      and not private.can_manage_org(organisation_id)
      and not private.is_platform_admin()
    )
    or private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy content_delete_manager
  on public.content
  for delete
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- content_platforms (via parent content org membership) ----
create policy content_platforms_select
  on public.content_platforms
  for select
  to authenticated
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.is_org_member(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy content_platforms_insert
  on public.content_platforms
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.is_org_member(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy content_platforms_update
  on public.content_platforms
  for update
  to authenticated
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.can_manage_org(c.organisation_id)
          or (
            private.is_org_member(c.organisation_id)
            and c.status = 'draft'
            and c.created_by = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.can_manage_org(c.organisation_id)
          or (
            private.is_org_member(c.organisation_id)
            and c.status = 'draft'
            and c.created_by = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

create policy content_platforms_delete
  on public.content_platforms
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.can_manage_org(c.organisation_id)
          or (
            private.is_org_member(c.organisation_id)
            and c.status = 'draft'
            and c.created_by = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

-- ---- content_tags ----
create policy content_tags_select
  on public.content_tags
  for select
  to authenticated
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.is_org_member(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy content_tags_insert
  on public.content_tags
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.is_org_member(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy content_tags_update
  on public.content_tags
  for update
  to authenticated
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.can_manage_org(c.organisation_id)
          or (
            private.is_org_member(c.organisation_id)
            and c.status = 'draft'
            and c.created_by = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.can_manage_org(c.organisation_id)
          or (
            private.is_org_member(c.organisation_id)
            and c.status = 'draft'
            and c.created_by = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

create policy content_tags_delete
  on public.content_tags
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          private.can_manage_org(c.organisation_id)
          or (
            private.is_org_member(c.organisation_id)
            and c.status = 'draft'
            and c.created_by = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

-- ---- campaigns ----
create policy campaigns_select
  on public.campaigns
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy campaigns_insert_manager
  on public.campaigns
  for insert
  to authenticated
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy campaigns_update_manager
  on public.campaigns
  for update
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy campaigns_delete_manager
  on public.campaigns
  for delete
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- campaign_products_services ----
create policy campaign_products_services_select
  on public.campaign_products_services
  for select
  to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (
          private.is_org_member(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy campaign_products_services_insert
  on public.campaign_products_services
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (
          private.can_manage_org(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy campaign_products_services_update
  on public.campaign_products_services
  for update
  to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (
          private.can_manage_org(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (
          private.can_manage_org(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

create policy campaign_products_services_delete
  on public.campaign_products_services
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (
          private.can_manage_org(c.organisation_id)
          or private.is_platform_admin()
        )
    )
  );

-- ---- analytics_metrics ----
create policy analytics_metrics_select
  on public.analytics_metrics
  for select
  to authenticated
  using (
    private.is_org_member(organisation_id)
    or private.is_platform_admin()
  );

create policy analytics_metrics_insert_manager
  on public.analytics_metrics
  for insert
  to authenticated
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy analytics_metrics_update_manager
  on public.analytics_metrics
  for update
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  )
  with check (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

create policy analytics_metrics_delete_manager
  on public.analytics_metrics
  for delete
  to authenticated
  using (
    private.can_manage_org(organisation_id)
    or private.is_platform_admin()
  );

-- ---- audit_logs (read-only for members/admins; inserts via security definer) ----
create policy audit_logs_select
  on public.audit_logs
  for select
  to authenticated
  using (
    (
      organisation_id is not null
      and private.is_org_member(organisation_id)
    )
    or private.is_platform_admin()
  );

create policy audit_logs_insert_manager
  on public.audit_logs
  for insert
  to authenticated
  with check (
    (
      organisation_id is not null
      and private.can_manage_org(organisation_id)
      and user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

-- ---- notifications ----
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_platform_admin()
  );

create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own
  on public.notifications
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_platform_admin()
  );

-- Managers/admins can create notifications for org members
create policy notifications_insert_manager
  on public.notifications
  for insert
  to authenticated
  with check (
    (
      organisation_id is not null
      and private.can_manage_org(organisation_id)
    )
    or private.is_platform_admin()
    or user_id = (select auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 10. Grants (authenticated)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, update on public.users to authenticated;
grant select, update, delete on public.organisations to authenticated;
grant select, insert, update, delete on public.organisation_members to authenticated;
grant select, insert, update on public.brand_profiles to authenticated;
grant select, insert, update, delete on public.products_services to authenticated;
grant select, insert, update on public.social_accounts to authenticated;
grant select, insert, update, delete on public.media_assets to authenticated;
grant select, insert, update, delete on public.content to authenticated;
grant select, insert, update, delete on public.content_platforms to authenticated;
grant select, insert, update, delete on public.content_tags to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_products_services to authenticated;
grant select, insert, update, delete on public.analytics_metrics to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Storage buckets + RLS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'media',
    'media',
    false,
    52428800, -- 50 MiB
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'video/webm'
    ]
  ),
  (
    'brand',
    'brand',
    false,
    10485760, -- 10 MiB
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml'
    ]
  )
on conflict (id) do nothing;

-- Helper: first path segment is organisation_id
-- storage.foldername(name)[1] in Supabase

create policy storage_media_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_media_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_media_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  )
  with check (
    bucket_id = 'media'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_media_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (
      private.can_manage_org((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_brand_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'brand'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_brand_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'brand'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_brand_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'brand'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  )
  with check (
    bucket_id = 'brand'
    and (
      private.is_org_member((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );

create policy storage_brand_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'brand'
    and (
      private.can_manage_org((storage.foldername(name))[1]::uuid)
      or private.is_platform_admin()
    )
  );
