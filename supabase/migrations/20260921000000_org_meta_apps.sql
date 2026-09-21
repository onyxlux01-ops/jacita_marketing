-- Per-organisation Meta (Facebook/Instagram) app credentials.
--
-- The platform ships with a single global Meta app (META_APP_ID / META_APP_SECRET)
-- shared by every business. That works while all businesses connect Meta accounts
-- that hold a role on the global app. When a business must connect a *different*
-- Meta account (e.g. its own agency/owner account) it needs its own Meta app so it
-- can authorise in Development mode without touching the shared app.
--
-- This table stores an optional per-org override. The app secret is encrypted at
-- rest with SOCIAL_TOKEN_ENCRYPTION_KEY (same scheme as social_account_secrets) and
-- is only ever read by the service-role server code — never exposed to clients.

create table public.organisation_meta_apps (
  organisation_id uuid primary key
    references public.organisations (id) on delete cascade,
  app_id text not null,
  -- Encrypted app secret (AES-256-GCM), mirroring social_account_secrets.
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  -- Optional human label (e.g. the Meta app's display name) for the settings UI.
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organisation_meta_apps_set_updated_at
  before update on public.organisation_meta_apps
  for each row
  execute function private.set_updated_at();

-- Secrets table: service-role only. No client (anon/authenticated) access at all;
-- all reads/writes go through the server admin client.
alter table public.organisation_meta_apps enable row level security;
alter table public.organisation_meta_apps force row level security;

revoke all on public.organisation_meta_apps from anon, authenticated;
grant all on public.organisation_meta_apps to service_role;

comment on table public.organisation_meta_apps is
  'Optional per-organisation Meta app credentials (encrypted app secret). Falls back to the global META_APP_ID/META_APP_SECRET when absent. Service-role only.';
comment on column public.organisation_meta_apps.app_id is
  'Meta app (client) id. Semi-public; used to build OAuth dialog + token exchange for this org.';
comment on column public.organisation_meta_apps.ciphertext is
  'AES-256-GCM encrypted Meta app secret. Never store the raw secret.';
