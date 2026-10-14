-- =============================================================================
-- Material edits invalidate approval (audit UI table / approved direction:
-- "Material edits to a post's caption, media, offer or price invalidate the
-- approved revision and require fresh review").
--
-- When content that is approved / scheduled / failed has a material field
-- changed, in the same statement:
--   * the content goes back to `review` (even if the writer tried to keep or
--     set an approved status in the same update);
--   * its queued jobs (pending / ready / retrying) are held
--     (hold_reason CONTENT_CHANGED) and their platform rows show `held`.
--     Re-approving re-queues them through schedule_content, which replaces
--     held jobs. Jobs already processing are not interrupted; the worker's
--     version check still refuses to publish stale copy on retry.
--
-- Material = everything the publisher sends or snapshots (title, hook,
-- caption, CTA, hashtags, media, content type) plus the linked product /
-- service, which carries the offer and price. Per-platform caption / hook /
-- CTA / hashtag overrides are material too.
--
-- Enforced in the database so every writer (content editor, automation
-- control-centre edits, Data API) gets the same rule.
-- =============================================================================

create or replace function private.hold_jobs_for_content_edit(
  p_content_id uuid,
  p_message text
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
        hold_reason = 'CONTENT_CHANGED',
        held_at = now(),
        error_type = 'STALE_CONTENT',
        error_code = 'CONTENT_CHANGED',
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

revoke all on function private.hold_jobs_for_content_edit(uuid, text) from public, anon, authenticated;

create or replace function private.content_material_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status::text in ('approved', 'scheduled', 'failed')
     and new.status::text in ('approved', 'scheduled', 'failed')
     and (
       new.caption is distinct from old.caption
       or new.hook is distinct from old.hook
       or new.call_to_action is distinct from old.call_to_action
       or new.hashtags is distinct from old.hashtags
       or new.title is distinct from old.title
       or new.media_asset_id is distinct from old.media_asset_id
       or new.content_type is distinct from old.content_type
       or new.product_service_id is distinct from old.product_service_id
     )
  then
    new.status := 'review';
    perform private.hold_jobs_for_content_edit(
      new.id,
      'This post was edited after approval. Review and approve it again to publish.'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.content_material_edit_guard() from public, anon, authenticated;

drop trigger if exists content_material_edit_guard on public.content;
create trigger content_material_edit_guard
  before update on public.content
  for each row
  execute function private.content_material_edit_guard();

-- AFTER (not BEFORE): holding updates this same platform row.
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
     or new.hashtags_override is distinct from old.hashtags_override
  then
    update public.content c
    set status = 'review'
    where c.id = new.content_id
      and c.status::text in ('approved', 'scheduled', 'failed');
    if found then
      perform private.hold_jobs_for_content_edit(
        new.content_id,
        'This post was edited after approval. Review and approve it again to publish.'
      );
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.content_platform_material_edit_guard() from public, anon, authenticated;

drop trigger if exists content_platforms_material_edit_guard on public.content_platforms;
create trigger content_platforms_material_edit_guard
  after update of caption_override, hook_override, cta_override, hashtags_override
  on public.content_platforms
  for each row
  execute function private.content_platform_material_edit_guard();
