-- =============================================================================
-- PR 7 follow-up: a reconcile can leave the campaign cache behind Meta.
--
-- When an operator reconciles a CREATE / ENABLE / UPDATE as `succeeded`, the
-- change is live in Meta but (typically after a cache-write failure) missing
-- from meta_ad_campaigns, so the limit projection would undercount. Chosen
-- fix (simpler and safer than syncing inside the reconcile): the business is
-- flagged `cache_sync_required_at`, and claim_advertising_action refuses
-- every CREATE / ENABLE / UPDATE until a campaign sync (LIST_CAMPAIGNS) that
-- STARTED after the flag has completed successfully. PAUSE and read-only
-- actions stay allowed. The server clears the flag after such a sync.
-- Function bodies are otherwise unchanged from 20261014190000.
-- =============================================================================

alter table public.advertising_settings
  add column if not exists cache_sync_required_at timestamptz;

comment on column public.advertising_settings.cache_sync_required_at is
  'Set when a reconciled action may be missing from the campaign cache. New CREATE/ENABLE/UPDATE claims are refused until a LIST_CAMPAIGNS sync started after this time succeeds.';

create or replace function public.claim_advertising_action(
  p_action_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.advertising_actions%rowtype;
  v_settings public.advertising_settings%rowtype;
  v_role public.org_role;
  v_payload jsonb;
  v_type text;
  v_limit bigint;
  v_period text;
  v_scope text;
  v_target text;          -- external campaign id the action touches (null for CREATE)
  v_new_active boolean;   -- resulting status of the touched campaign
  v_new_daily bigint;
  v_new_lifetime bigint;
  v_activates boolean := false;
  v_active_count integer;
  v_total bigint;
  v_budget bigint;
  v_claimed public.advertising_actions%rowtype;
begin
  select * into v_action
  from public.advertising_actions
  where id = p_action_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Action not found');
  end if;
  if v_action.status not in ('proposed', 'approved') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CLAIMABLE',
      'error', format('Action is %s', v_action.status), 'status', v_action.status);
  end if;

  -- One execution decision at a time per business.
  perform pg_advisory_xact_lock(hashtextextended('advertising:' || v_action.organisation_id::text, 0));

  select m.role into v_role
  from public.organisation_members m
  where m.organisation_id = v_action.organisation_id
    and m.user_id = p_actor_user_id;
  if v_role is null or v_role not in ('owner', 'manager') then
    if not exists (select 1 from public.users u where u.id = p_actor_user_id and u.is_platform_admin) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
        'error', 'Only owners and managers can approve advertising actions');
    end if;
  end if;

  select * into v_settings
  from public.advertising_settings
  where organisation_id = v_action.organisation_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_SETTINGS',
      'error', 'Advertising is not set up for this business');
  end if;
  -- Pausing is allowed in any mode; everything else needs approval mode.
  if v_settings.mode = 'off' and v_action.action_type <> 'PAUSE_CAMPAIGN' then
    return jsonb_build_object('ok', false, 'code', 'ADS_OFF', 'error', 'Advertising is turned off for this business');
  end if;
  if v_settings.mode = 'autopilot' and v_action.action_type <> 'PAUSE_CAMPAIGN' then
    return jsonb_build_object('ok', false, 'code', 'AUTOPILOT_DISABLED',
      'error', 'Autopilot advertising is not enabled. Keep mode on Approval.');
  end if;

  v_type := v_action.action_type;
  v_payload := coalesce(v_action.payload, '{}'::jsonb);

  if v_type in ('CREATE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN') then
    -- Hard stops.
    if v_settings.emergency_stopped then
      return jsonb_build_object('ok', false, 'code', 'EMERGENCY_STOP',
        'error', 'Advertising emergency stop is active.');
    end if;
    if v_settings.cache_sync_required_at is not null then
      return jsonb_build_object('ok', false, 'code', 'CACHE_SYNC_REQUIRED',
        'error', 'Campaigns changed outside the app''s records. Sync campaigns (List campaigns) before creating, enabling or changing campaigns.');
    end if;
    v_limit := v_settings.daily_spend_limit_cents;
    v_period := v_settings.limit_period;
    v_scope := v_settings.limit_scope;
    if coalesce(v_limit, 0) <= 0 then
      return jsonb_build_object('ok', false, 'code', 'NO_SPEND_LIMIT',
        'error', 'Set a spend limit greater than 0 before creating, enabling or changing campaigns.');
    end if;

    -- Projected campaign state: the cache, plus the effects of other
    -- actions that are executing right now, plus this action.
    create temporary table if not exists pg_temp.ad_projection (
      key text primary key,
      active boolean not null,
      daily bigint,
      lifetime bigint
    ) on commit drop;
    truncate pg_temp.ad_projection;

    insert into pg_temp.ad_projection (key, active, daily, lifetime)
    select c.external_campaign_id,
           upper(coalesce(c.effective_status, c.status, '')) = 'ACTIVE'
             or upper(coalesce(c.status, '')) = 'ACTIVE',
           c.daily_budget_cents,
           c.lifetime_budget_cents
    from public.meta_ad_campaigns c
    where c.organisation_id = v_action.organisation_id;

    -- Other in-flight actions (their Meta call may land any moment).
    insert into pg_temp.ad_projection (key, active, daily, lifetime)
    select 'pending:' || a.id::text,
           upper(coalesce(a.payload->>'status', 'PAUSED')) = 'ACTIVE',
           nullif(a.payload->>'dailyBudgetCents', '')::bigint,
           nullif(a.payload->>'lifetimeBudgetCents', '')::bigint
    from public.advertising_actions a
    where a.organisation_id = v_action.organisation_id
      and a.status = 'executing'
      and a.action_type = 'CREATE_CAMPAIGN'
      and a.id <> v_action.id;

    update pg_temp.ad_projection p
    set active = case
          when a.action_type = 'ENABLE_CAMPAIGN' then true
          when a.action_type = 'PAUSE_CAMPAIGN' then p.active
          when a.payload ? 'status' then upper(a.payload->>'status') = 'ACTIVE'
          else p.active
        end,
        daily = coalesce(nullif(a.payload->>'dailyBudgetCents', '')::bigint, p.daily),
        lifetime = coalesce(nullif(a.payload->>'lifetimeBudgetCents', '')::bigint, p.lifetime)
    from public.advertising_actions a
    where a.organisation_id = v_action.organisation_id
      and a.status = 'executing'
      and a.action_type in ('ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN')
      and a.id <> v_action.id
      and p.key = a.payload->>'externalCampaignId';

    -- This action.
    if v_type = 'CREATE_CAMPAIGN' then
      v_target := 'this';
      v_new_active := upper(coalesce(v_payload->>'status', 'PAUSED')) = 'ACTIVE';
      v_new_daily := nullif(v_payload->>'dailyBudgetCents', '')::bigint;
      v_new_lifetime := nullif(v_payload->>'lifetimeBudgetCents', '')::bigint;
      v_activates := v_new_active;
      insert into pg_temp.ad_projection (key, active, daily, lifetime)
      values (v_target, v_new_active, v_new_daily, v_new_lifetime);
    else
      v_target := v_payload->>'externalCampaignId';
      if v_target is null or not exists (select 1 from pg_temp.ad_projection where key = v_target) then
        return jsonb_build_object('ok', false, 'code', 'UNKNOWN_CAMPAIGN',
          'error', 'Campaign is not associated with this business. Sync campaigns first.');
      end if;
      select active into v_activates from pg_temp.ad_projection where key = v_target;
      v_activates := not v_activates;  -- was inactive
      update pg_temp.ad_projection
      set active = case
            when v_type = 'ENABLE_CAMPAIGN' then true
            when v_payload ? 'status' then upper(v_payload->>'status') = 'ACTIVE'
            else active
          end,
          daily = coalesce(nullif(v_payload->>'dailyBudgetCents', '')::bigint, daily),
          lifetime = coalesce(nullif(v_payload->>'lifetimeBudgetCents', '')::bigint, lifetime)
      where key = v_target
      returning active, daily, lifetime into v_new_active, v_new_daily, v_new_lifetime;
      v_activates := v_activates and v_new_active;
    end if;

    -- Active-campaign cap (when this action makes something active).
    if v_activates then
      select count(*) into v_active_count from pg_temp.ad_projection where active;
      if v_active_count > v_settings.max_active_campaigns then
        return jsonb_build_object('ok', false, 'code', 'ACTIVE_CAMPAIGN_LIMIT',
          'error', format('Active campaign limit (%s) would be exceeded.', v_settings.max_active_campaigns));
      end if;
    end if;

    -- The touched campaign must carry the budget type of the period.
    v_budget := case when v_period = 'daily' then v_new_daily else v_new_lifetime end;
    if v_budget is null then
      return jsonb_build_object('ok', false, 'code', 'BUDGET_TYPE_MISMATCH',
        'error', format('This business limits %s spend: the campaign needs a %s budget.', v_period, v_period));
    end if;
    if v_budget < 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_BUDGET', 'error', 'Budget cannot be negative');
    end if;

    if v_scope = 'per_campaign' then
      if v_budget > v_limit then
        return jsonb_build_object('ok', false, 'code', 'SPEND_LIMIT',
          'error', format('The %s budget (%s) exceeds the per-campaign limit (%s).', v_period, v_budget, v_limit));
      end if;
    else
      if v_new_active then
        select coalesce(sum(case when v_period = 'daily' then daily else lifetime end), 0)
          into v_total
        from pg_temp.ad_projection
        where active;
        if v_total > v_limit then
          return jsonb_build_object('ok', false, 'code', 'SPEND_LIMIT',
            'error', format('Active campaigns would total %s (%s), over the business limit (%s).', v_total, v_period, v_limit));
        end if;
      elsif v_budget > v_limit then
        -- Paused now, but could never be enabled within the limit.
        return jsonb_build_object('ok', false, 'code', 'SPEND_LIMIT',
          'error', format('The %s budget (%s) exceeds the business limit (%s).', v_period, v_budget, v_limit));
      end if;
    end if;
  elsif v_type = 'LINK_AD_ACCOUNT' and v_settings.emergency_stopped then
    return jsonb_build_object('ok', false, 'code', 'EMERGENCY_STOP',
      'error', 'Advertising emergency stop is active.');
  end if;
  -- PAUSE_CAMPAIGN and read-only actions only reduce spend / read data and
  -- stay allowed during an emergency stop.

  update public.advertising_actions
  set status = 'executing',
      approved_by = p_actor_user_id,
      approved_at = now(),
      executing_started_at = now()
  where id = p_action_id
    and status in ('proposed', 'approved')
  returning * into v_claimed;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_CLAIMABLE', 'error', 'Action was claimed by someone else');
  end if;

  return jsonb_build_object('ok', true, 'action', to_jsonb(v_claimed));
end;
$$;

revoke all on function public.claim_advertising_action(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_advertising_action(uuid, uuid) to service_role;

comment on function public.claim_advertising_action(uuid, uuid) is
  'Validate an advertising action against the CURRENT settings and campaign state (incl. in-flight actions) under a per-business lock, then claim it (-> executing). Only a caller that gets ok=true may call Meta. Service role only.';

-- -----------------------------------------------------------------------------
-- Reconcile a stuck action (operator, after checking Meta)
-- -----------------------------------------------------------------------------
create or replace function public.reconcile_advertising_action(
  p_action_id uuid,
  p_actor_user_id uuid,
  p_outcome text,
  p_note text default null,
  p_min_age interval default interval '15 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.advertising_actions%rowtype;
  v_role public.org_role;
begin
  if p_outcome not in ('failed', 'succeeded') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_OUTCOME', 'error', 'Outcome must be failed or succeeded');
  end if;

  select * into v_action from public.advertising_actions where id = p_action_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Action not found');
  end if;

  -- Same lock as claims, so a reconcile never races a claim's projection.
  perform pg_advisory_xact_lock(hashtextextended('advertising:' || v_action.organisation_id::text, 0));

  select m.role into v_role
  from public.organisation_members m
  where m.organisation_id = v_action.organisation_id and m.user_id = p_actor_user_id;
  if (v_role is null or v_role not in ('owner', 'manager'))
     and not exists (select 1 from public.users u where u.id = p_actor_user_id and u.is_platform_admin) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'error', 'Only owners and managers can reconcile advertising actions');
  end if;

  if v_action.status <> 'executing' then
    return jsonb_build_object('ok', false, 'code', 'NOT_EXECUTING',
      'error', format('Action is %s', v_action.status));
  end if;
  -- A recorded cache-write failure can be closed straight away; otherwise
  -- give a live request time to finish first.
  if coalesce(v_action.result ->> 'cache_write_failed', 'false') <> 'true'
     and coalesce(v_action.executing_started_at, v_action.updated_at) > now() - p_min_age then
    return jsonb_build_object('ok', false, 'code', 'TOO_EARLY',
      'error', 'This action may still be running. Try again in a few minutes.');
  end if;

  update public.advertising_actions
  set status = p_outcome,
      error_message = case
        when p_outcome = 'failed'
          then coalesce(p_note, 'Marked failed by an operator after checking Meta')
        else error_message
      end,
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'reconciled_by', p_actor_user_id,
        'reconciled_at', now(),
        'reconciled_outcome', p_outcome,
        'reconcile_note', p_note
      )
  where id = p_action_id;

  -- The change is live in Meta but maybe not in the cache: block new
  -- spend-affecting claims until a fresh sync.
  if p_outcome = 'succeeded'
     and v_action.action_type in ('CREATE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN') then
    update public.advertising_settings
    set cache_sync_required_at = now()
    where organisation_id = v_action.organisation_id;
  end if;

  insert into public.audit_logs (organisation_id, user_id, action, entity_type, entity_id, metadata)
  values (v_action.organisation_id, p_actor_user_id, 'ads.action_reconciled', 'advertising_actions',
    p_action_id, jsonb_build_object('outcome', p_outcome, 'note', p_note,
      'action_type', v_action.action_type, 'executing_started_at', v_action.executing_started_at));

  return jsonb_build_object('ok', true, 'status', p_outcome,
    'sync_required', p_outcome = 'succeeded'
      and v_action.action_type in ('CREATE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN'));
end;
$$;

revoke all on function public.reconcile_advertising_action(uuid, uuid, text, text, interval) from public, anon, authenticated;
grant execute on function public.reconcile_advertising_action(uuid, uuid, text, text, interval) to service_role;

comment on function public.reconcile_advertising_action(uuid, uuid, text, text, interval) is
  'Close an advertising action stuck in executing as failed or succeeded after the operator checked Meta. Never re-executes. Audited. Service role only.';
