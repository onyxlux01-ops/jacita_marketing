-- =============================================================================
-- Membership & role hardening (audit finding 1) + settings lockdown.
--
-- Before this migration, organisation_members INSERT/UPDATE/DELETE policies
-- used private.can_manage_org (owner OR manager), so a manager could use the
-- Data API directly to promote themselves to owner or remove the owner.
--
-- Rules enforced here (owner decisions, 2026-10):
--   * Each business has exactly ONE owner (partial unique index).
--   * Membership writes are owner / platform-admin only (RLS).
--   * Nobody changes their own role.
--   * No write may create, remove or change an owner row except inside
--     public.transfer_ownership() (transaction-local flag), with one
--     carve-out: trusted server code (create_organisation, service role) may
--     insert the FIRST owner of an organisation that has none.
--   * The owner row cannot be deleted while the organisation exists.
--   * autopilot mode is refused server-side for organisations,
--     automation_settings and advertising_settings.
--   * Owner + manager (never staff) may change org/automation/ads settings.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Exactly one owner per organisation
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select organisation_id
    from public.organisation_members
    where role = 'owner'
    group by organisation_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce single owner: some organisations have more than one owner. Resolve them (transfer/demote) before applying this migration.';
  end if;
end $$;

create unique index if not exists organisation_members_single_owner_idx
  on public.organisation_members (organisation_id)
  where role = 'owner';

-- -----------------------------------------------------------------------------
-- 2. Membership write policies: owner or platform admin only
-- -----------------------------------------------------------------------------
drop policy if exists organisation_members_insert_manager on public.organisation_members;
drop policy if exists organisation_members_update_manager on public.organisation_members;
drop policy if exists organisation_members_delete_manager on public.organisation_members;

create policy organisation_members_insert_owner
  on public.organisation_members
  for insert
  to authenticated
  with check (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

create policy organisation_members_update_owner
  on public.organisation_members
  for update
  to authenticated
  using (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  )
  with check (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

create policy organisation_members_delete_owner
  on public.organisation_members
  for delete
  to authenticated
  using (
    private.has_org_role(organisation_id, array['owner']::public.org_role[])
    or private.is_platform_admin()
  );

-- -----------------------------------------------------------------------------
-- 3. Membership guard trigger (applies to every role, incl. service_role)
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user must reflect who is really
-- writing (authenticated / service_role, or postgres inside a security
-- definer function such as create_organisation or transfer_ownership).
create or replace function private.guard_organisation_members()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transfer boolean :=
    coalesce(current_setting('jacita.ownership_transfer', true), '') = 'on';
  v_actor uuid := (select auth.uid());
  -- Trusted = SQL running as the database owner / service role (security
  -- definer functions such as create_organisation, migrations, server code).
  -- Direct Data API calls from browsers run as "authenticated".
  v_trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner' and not v_transfer then
      if not v_trusted then
        raise exception 'Owners can only be assigned via transfer_ownership'
          using errcode = '42501';
      end if;
      if exists (
        select 1 from public.organisation_members m
        where m.organisation_id = new.organisation_id and m.role = 'owner'
      ) then
        raise exception 'This business already has an owner. Use transfer_ownership.'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.organisation_id is distinct from old.organisation_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Memberships cannot be moved between users or businesses'
        using errcode = '42501';
    end if;

    if new.role is distinct from old.role and not v_transfer then
      if v_actor is not null and old.user_id = v_actor then
        raise exception 'You cannot change your own role'
          using errcode = '42501';
      end if;
      if old.role = 'owner' or new.role = 'owner' then
        raise exception 'Owner role can only change via transfer_ownership'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- DELETE
  if old.role = 'owner' and not v_transfer then
    -- Allow the cascade when the whole organisation is being deleted.
    if exists (
      select 1 from public.organisations o where o.id = old.organisation_id
    ) then
      raise exception 'The owner cannot be removed. Transfer ownership first.'
        using errcode = '42501';
    end if;
  end if;
  return old;
end;
$$;

revoke all on function private.guard_organisation_members() from public, anon, authenticated;

drop trigger if exists organisation_members_guard on public.organisation_members;
create trigger organisation_members_guard
  before insert or update or delete on public.organisation_members
  for each row
  execute function private.guard_organisation_members();

-- -----------------------------------------------------------------------------
-- 4. transfer_ownership RPC
-- -----------------------------------------------------------------------------
create or replace function public.transfer_ownership(
  p_organisation_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_is_admin boolean;
  v_old_owner uuid;
  v_target_role public.org_role;
  v_owner_count integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select u.is_platform_admin into v_is_admin
  from public.users u where u.id = v_actor;
  v_is_admin := coalesce(v_is_admin, false);

  -- Serialise concurrent transfers for this organisation.
  perform 1 from public.organisations o
  where o.id = p_organisation_id
  for update;
  if not found then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;

  select m.user_id into v_old_owner
  from public.organisation_members m
  where m.organisation_id = p_organisation_id and m.role = 'owner'
  for update;

  if not v_is_admin and (v_old_owner is null or v_old_owner <> v_actor) then
    raise exception 'Only the current owner or a platform admin can transfer ownership'
      using errcode = '42501';
  end if;

  select m.role into v_target_role
  from public.organisation_members m
  where m.organisation_id = p_organisation_id
    and m.user_id = p_new_owner_user_id
  for update;

  if v_target_role is null then
    raise exception 'The new owner must already be a member of this business'
      using errcode = '42501';
  end if;
  if v_target_role = 'owner' then
    raise exception 'That user is already the owner' using errcode = '22023';
  end if;

  perform set_config('jacita.ownership_transfer', 'on', true);

  update public.organisation_members
  set role = 'manager'
  where organisation_id = p_organisation_id and role = 'owner';

  update public.organisation_members
  set role = 'owner'
  where organisation_id = p_organisation_id
    and user_id = p_new_owner_user_id;

  perform set_config('jacita.ownership_transfer', '', true);

  select count(*) into v_owner_count
  from public.organisation_members m
  where m.organisation_id = p_organisation_id and m.role = 'owner';
  if v_owner_count <> 1 then
    raise exception 'Ownership transfer left % owners; aborted', v_owner_count;
  end if;

  insert into public.audit_logs (
    organisation_id, user_id, action, entity_type, entity_id, metadata
  ) values (
    p_organisation_id,
    v_actor,
    'organisation.ownership_transferred',
    'organisations',
    p_organisation_id,
    jsonb_build_object(
      'previous_owner_user_id', v_old_owner,
      'new_owner_user_id', p_new_owner_user_id,
      'by_platform_admin', v_is_admin and (v_old_owner is distinct from v_actor)
    )
  );
end;
$$;

revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

comment on function public.transfer_ownership(uuid, uuid) is
  'Atomically demote the current owner to manager and promote an existing member to owner. Caller must be the current owner or a platform admin.';

-- -----------------------------------------------------------------------------
-- 5. Refuse autopilot mode (server-side, every role)
-- -----------------------------------------------------------------------------
-- Existing autopilot rows are downgraded to the approval flow so no business
-- keeps unattended publishing / ad execution after this ships.
update public.organisations
set autopilot_mode = 'approval_required'
where autopilot_mode = 'autopilot';

update public.automation_settings
set mode = 'approval'
where mode = 'autopilot';

update public.advertising_settings
set mode = 'approval'
where mode = 'autopilot';

create or replace function private.reject_autopilot_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'organisations' then
    if new.autopilot_mode = 'autopilot' then
      raise exception 'Autopilot mode is not available yet'
        using errcode = '22023';
    end if;
  elsif new.mode = 'autopilot' then
    raise exception 'Autopilot mode is not available yet'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_autopilot_mode() from public, anon, authenticated;

drop trigger if exists organisations_reject_autopilot on public.organisations;
create trigger organisations_reject_autopilot
  before insert or update of autopilot_mode on public.organisations
  for each row
  execute function private.reject_autopilot_mode();

drop trigger if exists automation_settings_reject_autopilot on public.automation_settings;
create trigger automation_settings_reject_autopilot
  before insert or update of mode on public.automation_settings
  for each row
  execute function private.reject_autopilot_mode();

drop trigger if exists advertising_settings_reject_autopilot on public.advertising_settings;
create trigger advertising_settings_reject_autopilot
  before insert or update of mode on public.advertising_settings
  for each row
  execute function private.reject_autopilot_mode();

-- -----------------------------------------------------------------------------
-- 6. Settings writes: owner + manager (never staff), stated explicitly
-- -----------------------------------------------------------------------------
drop policy if exists organisations_update_manager_or_admin on public.organisations;
create policy organisations_update_manager_or_admin
  on public.organisations
  for update
  to authenticated
  using (
    private.has_org_role(id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  )
  with check (
    private.has_org_role(id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  );

drop policy if exists automation_settings_upsert on public.automation_settings;
create policy automation_settings_upsert
  on public.automation_settings for insert to authenticated
  with check (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  );

drop policy if exists automation_settings_update on public.automation_settings;
create policy automation_settings_update
  on public.automation_settings for update to authenticated
  using (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  )
  with check (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  );

-- advertising_settings previously had a single FOR ALL policy with no role
-- target; split it so reads stay member-wide and writes are owner/manager.
drop policy if exists advertising_settings_manage on public.advertising_settings;
create policy advertising_settings_insert
  on public.advertising_settings for insert to authenticated
  with check (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  );
create policy advertising_settings_update
  on public.advertising_settings for update to authenticated
  using (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  )
  with check (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  );
create policy advertising_settings_delete
  on public.advertising_settings for delete to authenticated
  using (
    private.has_org_role(organisation_id, array['owner', 'manager']::public.org_role[])
    or private.is_platform_admin()
  );
