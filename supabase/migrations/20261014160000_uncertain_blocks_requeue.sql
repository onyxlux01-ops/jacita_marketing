-- =============================================================================
-- Review fixes (stage 2):
--   1. An `uncertain` job (outcome unknown, the post may be live) blocks any
--      new job for the same content + account:
--        * it counts as active in social_publish_jobs_active_unique (the
--          backstop for every writer);
--        * schedule_content reports UNCERTAIN_PENDING for that account and
--          inserts nothing for it.
--   2. schedule_content: a one-platform "Publish now" no longer moves the
--      post's scheduled_at when its other platforms are still queued; an
--      unexpected error is logged on the server and returned as a generic
--      code instead of the raw database message.
--   3. content_material_edit_guard also holds queued jobs when a post moves
--      out of approved / scheduled / failed to draft or review (reject,
--      revert, account switch), so the calendar matches what will publish;
--      and hashtags compare normalised ("#fyp" = "fyp").
--   4. New content cannot be inserted from a browser session as scheduled /
--      publishing / published / failed: those states only come from the
--      scheduler and the publishing worker.
-- =============================================================================

-- 1. ---------------------------------------------------------------------------
-- Pre-existing rows: a queued job beside an uncertain one for the same
-- content + account is held (it must not run until a person has checked).
update public.social_publish_jobs j
set status = 'held',
    hold_reason = 'UNCERTAIN_OUTCOME',
    held_at = now(),
    error_code = 'UNCERTAIN_OUTCOME',
    error_message = 'An earlier attempt for this post may already be live. Check the platform before retrying.'
where j.status in ('pending', 'ready', 'retrying')
  and exists (
    select 1 from public.social_publish_jobs u
    where u.content_id = j.content_id
      and u.social_account_id = j.social_account_id
      and u.status = 'uncertain'
  );

do $$
declare
  v_conflicts integer;
begin
  select count(*) into v_conflicts
  from (
    select content_id, social_account_id
    from public.social_publish_jobs
    where status in ('pending', 'ready', 'processing', 'retrying', 'uncertain')
    group by content_id, social_account_id
    having count(*) > 1
  ) x;
  if v_conflicts > 0 then
    raise exception
      'social_publish_jobs: % content/account pairs have more than one processing/uncertain job; resolve them by hand before this migration',
      v_conflicts;
  end if;
end $$;

drop index if exists public.social_publish_jobs_active_unique;
create unique index social_publish_jobs_active_unique
  on public.social_publish_jobs (content_id, social_account_id)
  where status in ('pending', 'ready', 'processing', 'retrying', 'uncertain');

-- 2. ---------------------------------------------------------------------------
create or replace function public.schedule_content(
  p_content_id uuid,
  p_scheduled_at timestamptz,
  p_actor_user_id uuid,
  p_version_hash text,
  p_payload_snapshot jsonb default '{}'::jsonb,
  p_platforms public.social_platform[] default null,
  p_allow_immediate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content record;
  v_role public.org_role;
  v_targets jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_blocked jsonb := '[]'::jsonb;
  v_target record;
  v_job_id uuid;
  v_count integer := 0;
  v_others_queued boolean;
begin
  if p_scheduled_at is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TIME', 'error', 'A schedule time is required');
  end if;
  if not p_allow_immediate and p_scheduled_at < now() - interval '1 minute' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TIME', 'error', 'The schedule time is in the past');
  end if;
  if p_scheduled_at > now() + interval '366 days' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TIME', 'error', 'The schedule time is more than a year away');
  end if;
  if p_version_hash is null or length(p_version_hash) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Missing content version');
  end if;

  -- Serialises every scheduling / publish-now of this post.
  select c.id, c.organisation_id, c.status
    into v_content
  from public.content c
  where c.id = p_content_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Content not found');
  end if;

  select m.role into v_role
  from public.organisation_members m
  where m.organisation_id = v_content.organisation_id
    and m.user_id = p_actor_user_id;
  if v_role is null or v_role not in ('owner', 'manager') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'error', 'Only owners and managers can schedule publishing');
  end if;

  if v_content.status::text not in ('approved', 'scheduled', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'NOT_APPROVED',
      'error', 'Approve this content before it can be scheduled or published');
  end if;

  -- Platforms the content targets but that have no usable account.
  select coalesce(jsonb_agg(jsonb_build_object('platform', cp.platform, 'status', 'no_account')), '[]'::jsonb)
    into v_skipped
  from public.content_platforms cp
  where cp.content_id = p_content_id
    and (p_platforms is null or cp.platform = any (p_platforms))
    and not exists (
      select 1 from public.social_accounts a
      where a.organisation_id = v_content.organisation_id
        and a.platform = cp.platform
        and a.connection_status = 'connected'
        and a.external_account_id is not null
    );

  begin
    for v_target in
      select cp.id as cp_id, cp.platform, a.id as account_id, a.external_account_id
      from public.content_platforms cp
      join public.social_accounts a
        on a.organisation_id = v_content.organisation_id
       and a.platform = cp.platform
       and a.connection_status = 'connected'
       and a.external_account_id is not null
      where cp.content_id = p_content_id
        and (p_platforms is null or cp.platform = any (p_platforms))
      order by cp.platform
    loop
      -- The last attempt for this account may already be live: insert
      -- nothing for it until a person checks and retries that job.
      if exists (
        select 1 from public.social_publish_jobs u
        where u.content_id = p_content_id
          and u.social_account_id = v_target.account_id
          and u.status = 'uncertain'
      ) then
        v_blocked := v_blocked || jsonb_build_object(
          'platform', v_target.platform,
          'status', 'uncertain_pending',
          'social_account_id', v_target.account_id
        );
        continue;
      end if;

      update public.social_publish_jobs
      set status = 'cancelled',
          error_type = 'STALE_CONTENT',
          error_message = 'Rescheduled or replaced'
      where content_id = p_content_id
        and social_account_id = v_target.account_id
        and status in ('pending', 'ready', 'retrying', 'held');

      insert into public.social_publish_jobs (
        organisation_id, content_id, content_platform_id, social_account_id,
        target_external_account_id, platform, scheduled_at, status,
        max_attempts, created_by, content_version_hash, payload_snapshot,
        idempotency_key
      ) values (
        v_content.organisation_id, p_content_id, v_target.cp_id, v_target.account_id,
        v_target.external_account_id, v_target.platform, p_scheduled_at, 'pending',
        4, p_actor_user_id, p_version_hash, coalesce(p_payload_snapshot, '{}'::jsonb),
        left(encode(sha256(convert_to(
          v_content.organisation_id::text || ':' || p_content_id::text || ':' ||
          v_target.account_id::text || ':' || p_version_hash, 'UTF8')), 'hex'), 40)
      )
      returning id into v_job_id;

      update public.content_platforms
      set publish_status = 'scheduled',
          scheduled_at = p_scheduled_at,
          social_account_id = v_target.account_id,
          error_message = null
      where id = v_target.cp_id;

      v_targets := v_targets || jsonb_build_object(
        'platform', v_target.platform,
        'status', 'queued',
        'job_id', v_job_id,
        'social_account_id', v_target.account_id
      );
      v_count := v_count + 1;
    end loop;

    if v_count = 0 then
      if jsonb_array_length(v_blocked) > 0 then
        return jsonb_build_object('ok', false, 'code', 'UNCERTAIN_PENDING',
          'error', 'An earlier attempt for this post may already be live. Check the platform, then retry that job and confirm it is not live.',
          'platforms', v_blocked || v_skipped);
      end if;
      return jsonb_build_object('ok', false, 'code', 'NO_MATCHING_ACCOUNTS',
        'error', 'No connected social accounts match this content''s platforms. Connect accounts first.',
        'platforms', v_skipped);
    end if;

    -- A one-platform publish (p_platforms) must not move the post's time
    -- while its other platforms are still queued for later.
    select exists (
      select 1 from public.social_publish_jobs j
      where j.content_id = p_content_id
        and j.status in ('pending', 'ready', 'retrying')
        and p_platforms is not null
        and not (j.platform = any (p_platforms))
    ) into v_others_queued;

    update public.content
    set status = 'scheduled',
        scheduled_at = case
          when v_others_queued and scheduled_at is not null then scheduled_at
          else p_scheduled_at
        end
    where id = p_content_id;
  exception
    when unique_violation then
      -- Everything in this block (incl. cancellations) is rolled back.
      return jsonb_build_object('ok', false, 'code', 'ALREADY_PUBLISHING',
        'error', 'A post for this account is already publishing. Try again when it finishes.');
    when others then
      -- Details go to the server log, not to the caller.
      raise warning 'schedule_content(%) failed: % (%)', p_content_id, sqlerrm, sqlstate;
      return jsonb_build_object('ok', false, 'code', 'SCHEDULE_FAILED',
        'error', 'Could not schedule this post. Nothing was changed; try again.');
  end;

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_content.organisation_id,
    'scheduled_at', p_scheduled_at,
    'platforms', v_targets || v_blocked || v_skipped
  );
end;
$$;

revoke all on function public.schedule_content(uuid, timestamptz, uuid, text, jsonb, public.social_platform[], boolean)
  from public, anon, authenticated;
grant execute on function public.schedule_content(uuid, timestamptz, uuid, text, jsonb, public.social_platform[], boolean)
  to service_role;

-- 3. ---------------------------------------------------------------------------
drop function if exists private.hold_jobs_for_content_edit(uuid, text);

create or replace function private.hold_jobs_for_content_edit(
  p_content_id uuid,
  p_message text,
  p_reason text default 'CONTENT_CHANGED'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with held as (
    update public.social_publish_jobs j
    set status = 'held',
        hold_reason = p_reason,
        held_at = now(),
        error_type = case when p_reason = 'CONTENT_CHANGED' then 'STALE_CONTENT' else 'PERMISSION_ERROR' end,
        error_code = p_reason,
        error_message = p_message,
        locked_at = null,
        lock_token = null
    where j.content_id = p_content_id
      and j.status in ('pending', 'ready', 'retrying')
    returning j.content_platform_id
  ), marked as (
    update public.content_platforms cp
    set publish_status = 'held',
        error_message = p_message
    where cp.id in (select content_platform_id from held where content_platform_id is not null)
    returning cp.id
  )
  select count(*) into v_count from held;
  return v_count;
end;
$$;

revoke all on function private.hold_jobs_for_content_edit(uuid, text, text) from public, anon, authenticated;

create or replace function private.normalised_hashtags(p_tags text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(t order by ord), '{}'::text[])
  from (
    select btrim(regexp_replace(btrim(x), '^#+', '')) as t, ord
    from unnest(coalesce(p_tags, '{}'::text[])) with ordinality as u(x, ord)
  ) s
  where t <> '';
$$;

create or replace function private.content_material_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status::text not in ('approved', 'scheduled', 'failed') then
    return new;
  end if;

  if new.status::text in ('approved', 'scheduled', 'failed')
     and (
       new.caption is distinct from old.caption
       or new.hook is distinct from old.hook
       or new.call_to_action is distinct from old.call_to_action
       or private.normalised_hashtags(new.hashtags)
          is distinct from private.normalised_hashtags(old.hashtags)
       or new.title is distinct from old.title
       or new.media_asset_id is distinct from old.media_asset_id
       or new.content_type is distinct from old.content_type
       or new.product_service_id is distinct from old.product_service_id
     )
  then
    new.status := 'review';
    perform private.hold_jobs_for_content_edit(
      new.id,
      'This post was edited after approval. Review and approve it again to publish.',
      'CONTENT_CHANGED'
    );
  elsif new.status::text in ('draft', 'review') then
    -- Approval withdrawn (reject, revert to draft, account switch): nothing
    -- queued may stay looking scheduled. (publishing / published are the
    -- worker's own transitions and leave the other platforms queued.)
    perform private.hold_jobs_for_content_edit(
      new.id,
      'This post is no longer approved. Approve it again to publish.',
      'CONTENT_NOT_APPROVED'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.content_material_edit_guard() from public, anon, authenticated;

create or replace function private.content_platform_material_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.caption_override is distinct from old.caption_override
     or new.hook_override is distinct from old.hook_override
     or new.cta_override is distinct from old.cta_override
     or private.normalised_hashtags(new.hashtags_override)
        is distinct from private.normalised_hashtags(old.hashtags_override)
  then
    -- Hold as a material edit first; the status change below then finds
    -- nothing left to hold.
    if exists (
      select 1 from public.content c
      where c.id = new.content_id
        and c.status::text in ('approved', 'scheduled', 'failed')
    ) then
      perform private.hold_jobs_for_content_edit(
        new.content_id,
        'This post was edited after approval. Review and approve it again to publish.',
        'CONTENT_CHANGED'
      );
    end if;
    update public.content c
    set status = 'review'
    where c.id = new.content_id
      and c.status::text in ('approved', 'scheduled', 'failed');
  end if;
  return null;
end;
$$;

revoke all on function private.content_platform_material_edit_guard() from public, anon, authenticated;

-- 4. ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function private.content_insert_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.status::text not in ('draft', 'review', 'approved') then
    raise exception 'New content can only be created as draft, review or approved; scheduling goes through the scheduler'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.content_insert_status_guard() from public, anon, authenticated;

drop trigger if exists content_insert_status_guard on public.content;
create trigger content_insert_status_guard
  before insert on public.content
  for each row
  execute function private.content_insert_status_guard();
