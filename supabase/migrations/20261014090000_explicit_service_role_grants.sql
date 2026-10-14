-- Explicit service_role privileges on the public schema.
--
-- The earlier migrations relied on Supabase's legacy default privileges to
-- give the server (service_role) access to every public table. A stack that
-- does not auto-expose new tables (the newer CLI/cloud default; our
-- config.toml leaves auto_expose_new_tables unset) gives service_role no
-- access at all, which breaks every server-side query. State it explicitly.
-- On a project that already has the legacy grants this is a no-op.
-- service_role bypasses RLS and is only ever used by server code.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
