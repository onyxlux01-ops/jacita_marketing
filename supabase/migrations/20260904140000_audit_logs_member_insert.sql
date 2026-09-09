-- Allow any org member to write audit events for their own actions.
-- Managers already could; staff creating content / uploading media need this too.

drop policy if exists audit_logs_insert_manager on public.audit_logs;

create policy audit_logs_insert_member
  on public.audit_logs
  for insert
  to authenticated
  with check (
    (
      organisation_id is not null
      and private.is_org_member(organisation_id)
      and user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );
