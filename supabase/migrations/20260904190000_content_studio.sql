-- AI Content Studio foundations (series, history, package fields, media quality metadata)

alter table public.content
  add column if not exists series_id uuid,
  add column if not exists on_screen_text text,
  add column if not exists voiceover_script text,
  add column if not exists alt_text text,
  add column if not exists quality_score integer,
  add column if not exists quality_flags jsonb not null default '[]'::jsonb,
  add column if not exists parent_content_id uuid references public.content (id) on delete set null,
  add column if not exists posting_recommendation text;

alter table public.media_assets
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists duration_seconds numeric,
  add column if not exists file_size_bytes bigint,
  add column if not exists aspect_ratio text,
  add column if not exists quality_notes text;

-- Recurring content series
create table if not exists public.content_series (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  description text,
  frequency text not null default 'weekly'
    check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
  preferred_platform public.social_platform,
  content_rules text,
  is_active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_series_set_updated_at
  before update on public.content_series
  for each row
  execute function private.set_updated_at();

alter table public.content_series enable row level security;
alter table public.content_series force row level security;

create policy content_series_select
  on public.content_series for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy content_series_insert
  on public.content_series for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy content_series_update
  on public.content_series for update to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin())
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

create policy content_series_delete
  on public.content_series for delete to authenticated
  using (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert, update, delete on public.content_series to authenticated;

-- Link content.series_id after table exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_series_id_fkey'
  ) then
    alter table public.content
      add constraint content_series_id_fkey
      foreign key (series_id) references public.content_series (id) on delete set null;
  end if;
end $$;

create index if not exists content_series_org_idx
  on public.content_series (organisation_id);

create index if not exists content_parent_idx
  on public.content (parent_content_id);

create index if not exists content_series_link_idx
  on public.content (series_id);

-- Content lifecycle / edit history
create table if not exists public.content_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'edited',
      'regenerated',
      'rewritten',
      'repurposed',
      'variation_selected',
      'approved',
      'sent_to_review',
      'scheduled',
      'unscheduled',
      'published',
      'failed',
      'media_changed'
    )),
  actor_id uuid references public.users (id) on delete set null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists content_events_content_idx
  on public.content_events (content_id, created_at desc);

alter table public.content_events enable row level security;
alter table public.content_events force row level security;

create policy content_events_select
  on public.content_events for select to authenticated
  using (private.is_org_member(organisation_id) or private.is_platform_admin());

create policy content_events_insert
  on public.content_events for insert to authenticated
  with check (private.can_manage_org(organisation_id) or private.is_platform_admin());

grant select, insert on public.content_events to authenticated;

-- Ensure caption_override exists on content_platforms (from social layer; safe if already present)
alter table public.content_platforms
  add column if not exists caption_override text,
  add column if not exists hook_override text,
  add column if not exists hashtags_override text[],
  add column if not exists cta_override text;

comment on table public.content_series is
  'Recurring content series templates for AI-assisted generation.';
comment on table public.content_events is
  'Lifecycle history for content items (created, edited, approved, etc.).';
