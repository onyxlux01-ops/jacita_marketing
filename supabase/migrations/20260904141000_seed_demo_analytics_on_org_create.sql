-- Seed per-organisation demo analytics when a business is created,
-- so Analytics UI has stored metrics without live social APIs.

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

  for v_platform in
    select unnest(array['instagram', 'facebook', 'tiktok']::public.social_platform[])
  loop
    for v_i in 0..6 loop
      v_day := (current_date - (6 - v_i));
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
        revenue_attributed,
        source
      )
      values (
        v_org_id,
        v_platform,
        v_day,
        400 + v_i * 60,
        800 + v_i * 110,
        12 + v_i * 2,
        2 + v_i,
        1 + (v_i % 3),
        3 + v_i,
        15 + v_i * 3,
        8 + v_i * 2,
        case when v_i % 3 = 0 then 1 else 0 end,
        25 + v_i * 10,
        'demo'
      );
    end loop;
  end loop;

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
