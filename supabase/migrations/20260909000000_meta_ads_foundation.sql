-- Meta Ads foundation: ad accounts, campaign cache, approval actions, spend limits.
-- Organic social_accounts remain the connection for pages/IG; ads are separate.

create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_ad_account_id text not null,
  name text,
  currency text,
  timezone_name text,
  account_status text,
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error', 'pending')),
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, external_ad_account_id)
);

create index if not exists meta_ad_accounts_org_idx
  on public.meta_ad_accounts (organisation_id);

create table if not exists public.meta_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  meta_ad_account_id uuid not null references public.meta_ad_accounts (id) on delete cascade,
  external_campaign_id text not null,
  name text,
  objective text,
  status text,
  effective_status text,
  daily_budget_cents bigint,
  lifetime_budget_cents bigint,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, external_campaign_id)
);

create index if not exists meta_ad_campaigns_org_idx
  on public.meta_ad_campaigns (organisation_id);
create index if not exists meta_ad_campaigns_account_idx
  on public.meta_ad_campaigns (meta_ad_account_id);

create table if not exists public.advertising_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  -- approval = AI proposes only; autopilot reserved (not enabled yet)
  mode text not null default 'approval'
    check (mode in ('off', 'approval', 'autopilot')),
  daily_spend_limit_cents bigint not null default 0,
  max_active_campaigns integer not null default 5,
  emergency_stopped boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.advertising_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  meta_ad_account_id uuid references public.meta_ad_accounts (id) on delete set null,
  action_type text not null
    check (
      action_type in (
        'CREATE_CAMPAIGN',
        'UPDATE_CAMPAIGN',
        'PAUSE_CAMPAIGN',
        'ENABLE_CAMPAIGN',
        'GET_CAMPAIGN_INSIGHTS',
        'GET_AD_ACCOUNT',
        'LIST_CAMPAIGNS',
        'DISCOVER_AD_ACCOUNTS',
        'LINK_AD_ACCOUNT'
      )
    ),
  status text not null default 'proposed'
    check (
      status in (
        'proposed',
        'approved',
        'rejected',
        'executing',
        'succeeded',
        'failed',
        'cancelled'
      )
    ),
  proposed_by text not null default 'user'
    check (proposed_by in ('ai', 'user', 'system')),
  proposed_by_user_id uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advertising_actions_org_status_idx
  on public.advertising_actions (organisation_id, status, created_at desc);

-- RLS
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_ad_campaigns enable row level security;
alter table public.advertising_settings enable row level security;
alter table public.advertising_actions enable row level security;

create policy meta_ad_accounts_select on public.meta_ad_accounts
  for select using (private.is_org_member(organisation_id) or private.is_platform_admin());
create policy meta_ad_accounts_manage on public.meta_ad_accounts
  for all using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy meta_ad_campaigns_select on public.meta_ad_campaigns
  for select using (private.is_org_member(organisation_id) or private.is_platform_admin());
create policy meta_ad_campaigns_manage on public.meta_ad_campaigns
  for all using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy advertising_settings_select on public.advertising_settings
  for select using (private.is_org_member(organisation_id) or private.is_platform_admin());
create policy advertising_settings_manage on public.advertising_settings
  for all using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy advertising_actions_select on public.advertising_actions
  for select using (private.is_org_member(organisation_id) or private.is_platform_admin());
create policy advertising_actions_manage on public.advertising_actions
  for all using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

-- updated_at triggers (reuse private.set_updated_at from foundation)
drop trigger if exists meta_ad_accounts_updated_at on public.meta_ad_accounts;
create trigger meta_ad_accounts_updated_at
  before update on public.meta_ad_accounts
  for each row execute function private.set_updated_at();

drop trigger if exists meta_ad_campaigns_updated_at on public.meta_ad_campaigns;
create trigger meta_ad_campaigns_updated_at
  before update on public.meta_ad_campaigns
  for each row execute function private.set_updated_at();

drop trigger if exists advertising_settings_updated_at on public.advertising_settings;
create trigger advertising_settings_updated_at
  before update on public.advertising_settings
  for each row execute function private.set_updated_at();

drop trigger if exists advertising_actions_updated_at on public.advertising_actions;
create trigger advertising_actions_updated_at
  before update on public.advertising_actions
  for each row execute function private.set_updated_at();
