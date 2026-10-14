-- =============================================================================
-- Transactional scheduling (audit finding 8).
--
-- public.schedule_content() does, in ONE transaction:
--   1. validate the time (not past unless p_allow_immediate, not > 1 year),
--      lock the content row (serialises concurrent scheduling of a post),
--      check the actor is owner/manager and the content is approved /
--      scheduled / failed;
--   2. find usable targets (platform rows with a connected account of this
--      business that has an external id). None → return an error and change
--      NOTHING;
--   3. replace jobs (cancel old queued/held ones for those accounts, insert
--      new) — inside a sub-block, so if any insert fails (e.g. a post for the
--      account is already publishing) the cancellations roll back too;
--   4. set platform rows + content to scheduled;
--   5. return a per-platform result.
-- Service role only; the server passes the acting user explicitly (cron and
-- automation have no session) and the function re-checks that user's role.
-- =============================================================================

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
  v_target record;
  v_job_id uuid;
  v_count integer := 0;
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
      return jsonb_build_object('ok', false, 'code', 'NO_MATCHING_ACCOUNTS',
        'error', 'No connected social accounts match this content''s platforms. Connect accounts first.',
        'platforms', v_skipped);
    end if;

    update public.content
    set status = 'scheduled',
        scheduled_at = p_scheduled_at
    where id = p_content_id;
  exception
    when unique_violation then
      -- Everything in this block (incl. cancellations) is rolled back.
      return jsonb_build_object('ok', false, 'code', 'ALREADY_PUBLISHING',
        'error', 'A post for this account is already publishing. Try again when it finishes.');
    when others then
      return jsonb_build_object('ok', false, 'code', 'SCHEDULE_FAILED',
        'error', 'Could not schedule: ' || sqlerrm);
  end;

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_content.organisation_id,
    'scheduled_at', p_scheduled_at,
    'platforms', v_targets || v_skipped
  );
end;
$$;

revoke all on function public.schedule_content(uuid, timestamptz, uuid, text, jsonb, public.social_platform[], boolean)
  from public, anon, authenticated;
grant execute on function public.schedule_content(uuid, timestamptz, uuid, text, jsonb, public.social_platform[], boolean)
  to service_role;

comment on function public.schedule_content(uuid, timestamptz, uuid, text, jsonb, public.social_platform[], boolean) is
  'Validate targets, replace publish jobs and mark content/platform rows scheduled in one transaction. Returns {ok, error?, code?, platforms[]}. Service role only.';
