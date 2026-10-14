-- =============================================================================
-- PR 8: private access. People join a business only by accepting an invite.
--
-- * organisation_invites: email stored normalised (lower/trim), role can
--   never be owner (ownership only moves through transfer_ownership),
--   revocation / resend bookkeeping.
-- * accept_invite(invite_id): security definer. The caller's auth email must
--   match the invite (case-insensitive) and be confirmed; the invite must be
--   pending and not expired. Inserts the membership (never owner), marks the
--   invite accepted and writes an audit entry, in one transaction.
-- * organisation_members guard: a non-owner membership row can only be
--   inserted while accept_invite runs (transaction-local flag, honoured only
--   from trusted code). Owners still only come from create_organisation /
--   transfer_ownership. Browser sessions and the service role can no longer
--   add members directly.
-- =============================================================================

-- Existing rows: normalise, and retire any owner invite.
update public.organisation_invites
set email = lower(btrim(email))
where email <> lower(btrim(email));

update public.organisation_invites
set status = 'revoked'
where role = 'owner' and status = 'pending';

update public.organisation_invites
set role = 'manager'
where role = 'owner';

alter table public.organisation_invites
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.users (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_invites_not_owner') then
    alter table public.organisation_invites
      add constraint organisation_invites_not_owner check (role <> 'owner');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisation_invites_email_normalised') then
    alter table public.organisation_invites
      add constraint organisation_invites_email_normalised
      check (email = lower(btrim(email)) and position('@' in email) > 1);
  end if;
end $$;

comment on table public.organisation_invites is
  'Team invitations. Owners / platform admins invite (never as owner); the invitee joins via accept_invite().';

-- -----------------------------------------------------------------------------
-- Membership guard: non-owner inserts only from accept_invite
-- -----------------------------------------------------------------------------
create or replace function private.guard_organisation_members()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
  v_transfer boolean :=
    v_trusted
    and coalesce(current_setting('jacita.ownership_transfer', true), '') = 'on';
  v_invite boolean :=
    v_trusted
    and coalesce(current_setting('jacita.invite_accept', true), '') = 'on';
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
    if new.role <> 'owner' and not v_invite then
      raise exception 'Members join a business by accepting an invite'
        using errcode = '42501';
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
    if private.organisation_exists(old.organisation_id) then
      raise exception 'The owner cannot be removed. Transfer ownership first.'
        using errcode = '42501';
    end if;
  end if;
  return old;
end;
$$;

revoke all on function private.guard_organisation_members() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- accept_invite
-- -----------------------------------------------------------------------------
create or replace function public.accept_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_confirmed timestamptz;
  v_invite public.organisation_invites%rowtype;
  v_member_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'error', 'Sign in to accept this invite');
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at
    into v_email, v_confirmed
  from auth.users u
  where u.id = v_uid;

  select * into v_invite
  from public.organisation_invites i
  where i.id = p_invite_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'This invite does not exist');
  end if;

  -- Same answer for "not yours" and "not found" would hide existence, but the
  -- invitee needs to know to sign in with the invited address.
  if v_email is null or v_email <> v_invite.email then
    return jsonb_build_object('ok', false, 'code', 'WRONG_EMAIL',
      'error', 'This invite was sent to a different email address. Sign in with that address to accept it.');
  end if;
  if v_confirmed is null then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_NOT_CONFIRMED',
      'error', 'Confirm your email address first');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'NOT_PENDING',
      'error', format('This invite is %s', v_invite.status));
  end if;
  if v_invite.expires_at <= now() then
    update public.organisation_invites set status = 'expired' where id = v_invite.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED',
      'error', 'This invite has expired. Ask the business owner to send a new one.');
  end if;
  if v_invite.role = 'owner' then
    -- Unreachable (CHECK constraint); kept as a hard stop.
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROLE', 'error', 'Invalid invite');
  end if;

  select m.id into v_member_id
  from public.organisation_members m
  where m.organisation_id = v_invite.organisation_id and m.user_id = v_uid;

  if v_member_id is null then
    perform set_config('jacita.invite_accept', 'on', true);
    insert into public.organisation_members (organisation_id, user_id, role)
    values (v_invite.organisation_id, v_uid, v_invite.role)
    returning id into v_member_id;
    perform set_config('jacita.invite_accept', 'off', true);
  end if;

  update public.organisation_invites
  set status = 'accepted',
      accepted_at = now(),
      accepted_user_id = v_uid
  where id = v_invite.id;

  insert into public.audit_logs (organisation_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_invite.organisation_id, v_uid, 'team.invite_accepted', 'organisation_invites', v_invite.id,
    jsonb_build_object('role', v_invite.role, 'membership_id', v_member_id)
  );

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_invite.organisation_id,
    'role', v_invite.role,
    'membership_id', v_member_id
  );
end;
$$;

revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

comment on function public.accept_invite(uuid) is
  'Accept a pending, unexpired invite addressed to the caller''s confirmed email: adds the membership (never owner), marks the invite accepted, audits. The only way to join a business.';

-- -----------------------------------------------------------------------------
-- is_member_by_email: server-side duplicate check before inviting (emails
-- live in auth.users). Service role only.
-- -----------------------------------------------------------------------------
create or replace function public.is_member_by_email(p_organisation_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_members m
    join auth.users u on u.id = m.user_id
    where m.organisation_id = p_organisation_id
      and lower(btrim(u.email)) = lower(btrim(p_email))
  );
$$;

revoke all on function public.is_member_by_email(uuid, text) from public, anon, authenticated;
grant execute on function public.is_member_by_email(uuid, text) to service_role;
