-- =============================================================================
-- AI spending limits (audit finding 10).
--
-- * ai_settings: per-business monthly AI budget (pence, default 5000 = £50)
--   and daily AI image cap (default 20). Members read it. ONLY the platform
--   admin changes it (every business shares the operator's provider key),
--   through set_ai_limits(); there are no direct write grants. updated_by is
--   set by a trigger. A business with no row uses the defaults.
-- * ai_usage: the ledger. One row per paid provider attempt (retries are
--   separate rows). Written ONLY by the server (service role) through the
--   RPCs below; members can read their business's rows.
--     reserved  -> an upper-bound estimate held before the provider call
--     committed -> the call happened; costs coalesce(actual, estimated)
--     released  -> the call failed before being charged
--   A reservation not settled within 15 minutes is treated as charged: it
--   becomes committed at its estimate with error_code = 'stale' (a late
--   commit may still replace that with the actual cost). Over-counting is
--   the safe direction.
-- * reserve_ai_spend(): ONE transaction, per-business advisory lock (plus a
--   per-user lock): commits stale reservations at their estimate, checks
--   per-user concurrency,
--   the daily image cap and the monthly budget, then inserts a reserved row.
--   Month and day are calendar periods in organisations.timezone.
-- * Amounts are numeric pence (4 dp) so sub-penny text calls are not rounded
--   up to a whole penny each.
-- =============================================================================

create table if not exists public.ai_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  monthly_budget_pence integer not null default 5000,
  daily_image_cap integer not null default 20,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_settings_budget_range check (monthly_budget_pence between 0 and 1000000),
  constraint ai_settings_image_cap_range check (daily_image_cap between 0 and 1000)
);

comment on table public.ai_settings is
  'Per-business AI limits. Missing row = defaults (5000 pence/month, 20 images/day).';
comment on column public.ai_settings.monthly_budget_pence is
  'Estimated AI spend allowed per calendar month in the business timezone, in GBP pence.';
comment on column public.ai_settings.daily_image_cap is
  'AI images allowed per calendar day in the business timezone.';

drop trigger if exists ai_settings_set_updated_at on public.ai_settings;
create trigger ai_settings_set_updated_at
  before update on public.ai_settings
  for each row
  execute function private.set_updated_at();

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  task text not null,
  provider text not null,
  model text not null,
  request_id uuid,
  attempt smallint not null default 1,
  input_tokens integer,
  output_tokens integer,
  image_count integer not null default 0,
  estimated_cost_pence numeric(12, 4) not null,
  actual_cost_pence numeric(12, 4),
  status text not null default 'reserved',
  error_code text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint ai_usage_status_check check (status in ('reserved', 'committed', 'released')),
  constraint ai_usage_amounts_check check (
    estimated_cost_pence >= 0
    and (actual_cost_pence is null or actual_cost_pence >= 0)
    and image_count >= 0
    and attempt >= 1
    and (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
  ),
  constraint ai_usage_text_lengths check (
    char_length(task) <= 64 and char_length(provider) <= 64 and char_length(model) <= 128
    and (error_code is null or char_length(error_code) <= 64)
  )
);

comment on table public.ai_usage is
  'AI spend ledger. Server-written only (service role / RPCs). Costs are ESTIMATES from the server price table.';

create index if not exists ai_usage_org_created_idx
  on public.ai_usage (organisation_id, created_at desc);
create index if not exists ai_usage_user_reserved_idx
  on public.ai_usage (user_id, created_at)
  where status = 'reserved';

alter table public.ai_settings enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists ai_settings_select on public.ai_settings;
create policy ai_settings_select on public.ai_settings
  for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

-- No insert/update policy for ai_settings: changes go through set_ai_limits()
-- (platform admin only).

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());
-- No insert/update/delete policy for ai_usage: only the service role writes.

-- -----------------------------------------------------------------------------
-- Grants: members read (RLS). Neither table is writable from the browser:
-- the ledger is written by the server, the limits by set_ai_limits().
-- -----------------------------------------------------------------------------
revoke all on public.ai_usage from anon, authenticated;
revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant select on public.ai_settings to authenticated;
grant all on public.ai_usage, public.ai_settings to service_role;

-- updated_by is always the signed-in user making the change (null for the
-- service role), never a value supplied by the caller.
create or replace function private.ai_settings_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function private.ai_settings_stamp() from public, anon, authenticated;

drop trigger if exists ai_settings_stamp on public.ai_settings;
create trigger ai_settings_stamp
  before insert or update on public.ai_settings
  for each row
  execute function private.ai_settings_stamp();

-- -----------------------------------------------------------------------------
-- Change a business's limits: platform admin only.
-- -----------------------------------------------------------------------------
create or replace function public.set_ai_limits(
  p_organisation_id uuid,
  p_monthly_budget_pence integer,
  p_daily_image_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev public.ai_settings%rowtype;
begin
  if not private.is_platform_admin() then
    raise exception 'Only the platform admin can change AI limits' using errcode = '42501';
  end if;
  if p_monthly_budget_pence is null or p_monthly_budget_pence not between 0 and 1000000
     or p_daily_image_cap is null or p_daily_image_cap not between 0 and 1000 then
    raise exception 'AI limits out of range' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organisations o where o.id = p_organisation_id) then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;

  select * into v_prev from public.ai_settings where organisation_id = p_organisation_id;

  insert into public.ai_settings (organisation_id, monthly_budget_pence, daily_image_cap)
  values (p_organisation_id, p_monthly_budget_pence, p_daily_image_cap)
  on conflict (organisation_id) do update
    set monthly_budget_pence = excluded.monthly_budget_pence,
        daily_image_cap = excluded.daily_image_cap;

  insert into public.audit_logs (organisation_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_organisation_id, (select auth.uid()), 'ai.limits_updated', 'ai_settings', p_organisation_id,
    jsonb_build_object(
      'monthly_budget_pence', p_monthly_budget_pence,
      'daily_image_cap', p_daily_image_cap,
      'previous_monthly_budget_pence', coalesce(v_prev.monthly_budget_pence, 5000),
      'previous_daily_image_cap', coalesce(v_prev.daily_image_cap, 20)
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_ai_limits(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.set_ai_limits(uuid, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Totals for one business at a point in time (service role only; p_at is a
-- parameter so the timezone windows can be tested).
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_totals(
  p_organisation_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_local timestamp;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_budget integer;
  v_cap integer;
  v_spend numeric;
  v_estimated numeric;
  v_actual numeric;
  v_no_actual integer;
  v_images integer;
begin
  select coalesce(nullif(o.timezone, ''), 'Europe/London') into v_tz
  from public.organisations o
  where o.id = p_organisation_id;
  if not found then
    return null;
  end if;

  begin
    v_local := p_at at time zone v_tz;
  exception when others then
    v_tz := 'Europe/London';
    v_local := p_at at time zone v_tz;
  end;

  v_month_start := date_trunc('month', v_local) at time zone v_tz;
  v_month_end := (date_trunc('month', v_local) + interval '1 month') at time zone v_tz;
  v_day_start := date_trunc('day', v_local) at time zone v_tz;
  v_day_end := (date_trunc('day', v_local) + interval '1 day') at time zone v_tz;

  select s.monthly_budget_pence, s.daily_image_cap into v_budget, v_cap
  from public.ai_settings s
  where s.organisation_id = p_organisation_id;
  v_budget := coalesce(v_budget, 5000);
  v_cap := coalesce(v_cap, 20);

  -- Committed rows cost their actual (else estimated) amount. Reservations
  -- hold their estimate whatever their age (one that is never settled turns
  -- into a committed 'stale' row at the next reservation). Released rows
  -- cost nothing.
  select
    coalesce(sum(
      case
        when u.status = 'committed' then coalesce(u.actual_cost_pence, u.estimated_cost_pence)
        else u.estimated_cost_pence
      end
    ) filter (where in_month), 0),
    coalesce(sum(u.estimated_cost_pence) filter (where in_month), 0),
    coalesce(sum(u.actual_cost_pence)
      filter (where in_month and u.status = 'committed' and u.actual_cost_pence is not null), 0),
    count(*) filter (where in_month and (u.status = 'reserved' or u.actual_cost_pence is null)),
    coalesce(sum(u.image_count) filter (where in_day), 0)
  into v_spend, v_estimated, v_actual, v_no_actual, v_images
  from (
    select x.*,
      (x.created_at >= v_month_start and x.created_at < v_month_end) as in_month,
      (x.created_at >= v_day_start and x.created_at < v_day_end) as in_day
    from public.ai_usage x
    where x.organisation_id = p_organisation_id
      and x.created_at >= least(v_month_start, v_day_start)
      and x.created_at < greatest(v_month_end, v_day_end)
      and x.status in ('committed', 'reserved')
  ) u;

  return jsonb_build_object(
    'timezone', v_tz,
    'month_start', v_month_start,
    'day_start', v_day_start,
    -- what the budget is checked against: actual where known, else estimate
    'month_spend_pence', v_spend,
    -- shown separately (audit): up-front estimates vs. costs from reported usage
    'month_estimated_pence', v_estimated,
    'month_actual_pence', v_actual,
    'month_calls_without_actual', v_no_actual,
    'monthly_budget_pence', v_budget,
    'images_today', v_images,
    'daily_image_cap', v_cap
  );
end;
$$;

revoke all on function public.ai_spend_totals(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_spend_totals(uuid, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- Member-facing summary (current time only).
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_summary(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_org_member(p_organisation_id) or private.is_platform_admin()) then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  return public.ai_spend_totals(p_organisation_id, now());
end;
$$;

revoke all on function public.ai_spend_summary(uuid) from public, anon, authenticated;
grant execute on function public.ai_spend_summary(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Reserve before a paid call (service role only).
-- -----------------------------------------------------------------------------
create or replace function public.reserve_ai_spend(
  p_organisation_id uuid,
  p_user_id uuid,
  p_task text,
  p_provider text,
  p_model text,
  p_estimated_pence numeric,
  p_image_count integer,
  p_request_id uuid,
  p_attempt integer,
  p_max_inflight_per_user integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_totals jsonb;
  v_inflight integer;
  v_id uuid;
  v_spend numeric;
  v_budget integer;
  v_images integer;
  v_cap integer;
begin
  if p_estimated_pence is null or p_estimated_pence < 0
     or p_image_count is null or p_image_count < 0 then
    return jsonb_build_object('ok', false, 'code', 'AI_INVALID_RESERVATION',
      'error', 'Invalid AI cost estimate');
  end if;

  -- One spend decision at a time per business (and per user, for the
  -- concurrency limit across businesses). Lock order is always business
  -- then user.
  perform pg_advisory_xact_lock(hashtextextended('ai_spend:' || p_organisation_id::text, 0));
  if p_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('ai_spend_user:' || p_user_id::text, 0));

    if not exists (
      select 1 from public.organisation_members m
      where m.organisation_id = p_organisation_id and m.user_id = p_user_id
    ) and not exists (
      select 1 from public.users u where u.id = p_user_id and u.is_platform_admin
    ) then
      return jsonb_build_object('ok', false, 'code', 'AI_NOT_MEMBER',
        'error', 'Not a member of this business');
    end if;
  end if;

  if not exists (select 1 from public.organisations o where o.id = p_organisation_id) then
    return jsonb_build_object('ok', false, 'code', 'AI_NOT_FOUND', 'error', 'Business not found');
  end if;

  -- A reservation not settled within 15 minutes is treated as charged at its
  -- estimate (the call may have run and the settle been lost). It stops
  -- counting towards the user's in-flight limit, but not towards the budget.
  update public.ai_usage
  set status = 'committed', error_code = 'stale', settled_at = now()
  where organisation_id = p_organisation_id
    and status = 'reserved'
    and created_at <= now() - interval '15 minutes';

  if p_user_id is not null and p_max_inflight_per_user is not null then
    select count(*) into v_inflight
    from public.ai_usage u
    where u.user_id = p_user_id
      and u.status = 'reserved'
      and u.created_at > now() - interval '15 minutes';
    if v_inflight >= p_max_inflight_per_user then
      return jsonb_build_object('ok', false, 'code', 'AI_CONCURRENCY_LIMIT',
        'error', 'Too many AI requests in progress',
        'in_flight', v_inflight, 'limit', p_max_inflight_per_user);
    end if;
  end if;

  v_totals := public.ai_spend_totals(p_organisation_id, now());
  v_spend := (v_totals ->> 'month_spend_pence')::numeric;
  v_budget := (v_totals ->> 'monthly_budget_pence')::integer;
  v_images := (v_totals ->> 'images_today')::integer;
  v_cap := (v_totals ->> 'daily_image_cap')::integer;

  if p_image_count > 0 and v_images + p_image_count > v_cap then
    return jsonb_build_object('ok', false, 'code', 'AI_DAILY_IMAGE_CAP',
      'error', 'Daily AI image limit reached') || v_totals;
  end if;

  if v_spend + p_estimated_pence > v_budget then
    return jsonb_build_object('ok', false, 'code', 'AI_BUDGET_EXCEEDED',
      'error', 'Monthly AI budget reached', 'estimated_pence', p_estimated_pence) || v_totals;
  end if;

  insert into public.ai_usage (
    organisation_id, user_id, task, provider, model, request_id, attempt,
    image_count, estimated_cost_pence, status
  ) values (
    p_organisation_id, p_user_id, left(coalesce(p_task, 'unknown'), 64),
    left(coalesce(p_provider, 'unknown'), 64), left(coalesce(p_model, 'unknown'), 128),
    p_request_id, greatest(coalesce(p_attempt, 1), 1),
    p_image_count, p_estimated_pence, 'reserved'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id) || v_totals;
end;
$$;

revoke all on function public.reserve_ai_spend(uuid, uuid, text, text, text, numeric, integer, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_spend(uuid, uuid, text, text, text, numeric, integer, uuid, integer, integer)
  to service_role;

comment on function public.reserve_ai_spend(uuid, uuid, text, text, text, numeric, integer, uuid, integer, integer) is
  'Atomically check the business AI budget, daily image cap and per-user concurrency, then hold a reservation. Only a caller that gets ok=true may call the provider. Service role only.';

-- -----------------------------------------------------------------------------
-- Settle a reservation (service role only).
--   commit : the provider call happened (cost = actual, else estimate). Also
--            accepted for a reservation already committed as 'stale', so a
--            slow call that did complete replaces the estimate with its
--            actual cost.
--   release: the call failed without being charged. A 'stale' row stays
--            committed (over-counting is the safe direction).
-- -----------------------------------------------------------------------------
create or replace function public.commit_ai_spend(
  p_usage_id uuid,
  p_actual_pence numeric,
  p_input_tokens integer,
  p_output_tokens integer,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_usage
  set status = 'committed',
      actual_cost_pence = case when p_actual_pence is null or p_actual_pence < 0 then null else p_actual_pence end,
      input_tokens = case when p_input_tokens is null or p_input_tokens < 0 then null else p_input_tokens end,
      output_tokens = case when p_output_tokens is null or p_output_tokens < 0 then null else p_output_tokens end,
      error_code = case
        when status = 'committed' then left(coalesce(p_error_code, 'late_commit'), 64)
        else left(p_error_code, 64)
      end,
      settled_at = now()
  where id = p_usage_id
    and (status = 'reserved' or (status = 'committed' and error_code = 'stale'));
  return found;
end;
$$;

create or replace function public.release_ai_spend(
  p_usage_id uuid,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_usage
  set status = 'released',
      error_code = left(coalesce(p_error_code, 'failed'), 64),
      settled_at = now()
  where id = p_usage_id
    and status = 'reserved';
  return found;
end;
$$;

revoke all on function public.commit_ai_spend(uuid, numeric, integer, integer, text) from public, anon, authenticated;
revoke all on function public.release_ai_spend(uuid, text) from public, anon, authenticated;
grant execute on function public.commit_ai_spend(uuid, numeric, integer, integer, text) to service_role;
grant execute on function public.release_ai_spend(uuid, text) to service_role;
