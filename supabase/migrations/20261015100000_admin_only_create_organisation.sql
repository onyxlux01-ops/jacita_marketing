-- =============================================================================
-- Only the platform admin may create a business (organisation).
--
-- Before this migration any signed-in user could call create_organisation()
-- and become the owner of a new business. Every business gets its own AI
-- budget but they all spend the platform's OpenAI key, so an invited
-- assistant could multiply the operator's spend by creating businesses.
--
-- Now both the public wrapper and the private implementation refuse unless
-- private.is_platform_admin() is true (error ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS,
-- SQLSTATE 42501). People join existing businesses only through invites
-- (accept_invite).
--
-- Unchanged on purpose:
--   * Same signatures (create or replace), so callers do not break.
--   * security definer + search_path = ''.
--   * The creator still becomes the first owner. The insert runs inside this
--     security-definer function (current_user = postgres), which is the
--     trusted path the organisation_members guard trigger allows for the
--     FIRST owner of a business that has none.
--   * EXECUTE grants: public wrapper for authenticated only (never anon);
--     private implementation for nobody but its owner.
--
-- The private body below is the latest definition
-- (20260904180000_business_onboarding_management.sql) plus the admin check.
-- =============================================================================

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

  if not private.is_platform_admin() then
    raise exception 'ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS'
      using errcode = '42501',
            hint = 'Only the workspace administrator can add businesses.';
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

revoke all on function private.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

-- Public wrapper: checks first so the refusal never depends on the private
-- body alone (defence in depth), then delegates.
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not private.is_platform_admin() then
    raise exception 'ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS'
      using errcode = '42501',
            hint = 'Only the workspace administrator can add businesses.';
  end if;

  return private.create_organisation(
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
end;
$$;

revoke all on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) to authenticated;

comment on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, jsonb
) is 'Create a business; the caller becomes its first owner. Platform admin only (ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS).';
