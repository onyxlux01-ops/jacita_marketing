import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const ACCOUNT_CHANGED = "ACCOUNT_CHANGED";

/**
 * Called BEFORE a social account's external_account_id is changed (Page /
 * Instagram account switch, or reconnecting a different account).
 *
 * - pending / ready / retrying jobs → `held` (ACCOUNT_CHANGED); they need
 *   re-approval and are never run by the worker.
 * - processing jobs are flagged (hold_reason) but not interrupted; if they
 *   end up retrying, the worker's target check holds them.
 * - the affected content goes back to `review`. NOTE: review applies to the
 *   whole post, so its other platforms' queued jobs are held too
 *   (CONTENT_NOT_APPROVED) until the post is re-approved.
 *
 * Throws on any failed write so callers abort before touching the account.
 */
export async function holdJobsForAccountChange(
  admin: Admin,
  input: {
    organisationId: string;
    socialAccountId: string;
    oldExternalId: string | null;
    newExternalId: string;
  }
) {
  const now = new Date().toISOString();
  const message = `Connected account changed (${input.oldExternalId ?? "none"} → ${input.newExternalId}). Re-approve this post for the new account.`;

  const { data: held, error: holdError } = await admin
    .from("social_publish_jobs")
    .update({
      status: "held",
      hold_reason: ACCOUNT_CHANGED,
      held_at: now,
      error_type: "BLOCKED_ACCOUNT",
      error_code: ACCOUNT_CHANGED,
      error_message: message,
      locked_at: null,
      lock_token: null,
    })
    .eq("organisation_id", input.organisationId)
    .eq("social_account_id", input.socialAccountId)
    .in("status", ["pending", "ready", "retrying"])
    .select("id, content_id, content_platform_id");
  if (holdError) throw new Error(`Could not hold queued posts: ${holdError.message}`);

  const platformRowIds = (held || [])
    .map((j) => j.content_platform_id)
    .filter((id): id is string => Boolean(id));
  if (platformRowIds.length) {
    const { error: cpError } = await admin
      .from("content_platforms")
      .update({ publish_status: "held", error_message: message })
      .in("id", platformRowIds);
    if (cpError) {
      throw new Error(`Could not mark platform rows held: ${cpError.message}`);
    }
  }

  const { data: flagged, error: flagError } = await admin
    .from("social_publish_jobs")
    .update({ hold_reason: ACCOUNT_CHANGED, held_at: now })
    .eq("organisation_id", input.organisationId)
    .eq("social_account_id", input.socialAccountId)
    .eq("status", "processing")
    .select("id, content_id");
  if (flagError) {
    throw new Error(`Could not flag in-flight posts: ${flagError.message}`);
  }

  const contentIds = [...new Set((held || []).map((j) => j.content_id))];
  let siblingHeld: string[] = [];
  if (contentIds.length) {
    // Review applies to the whole post: hold its other platforms' queued
    // jobs now (rather than when the worker reaches them) so the UI shows it.
    const { data: siblings, error: siblingError } = await admin
      .from("social_publish_jobs")
      .update({
        status: "held",
        hold_reason: "CONTENT_NOT_APPROVED",
        held_at: now,
        error_type: "PERMISSION_ERROR",
        error_code: "CONTENT_NOT_APPROVED",
        error_message:
          "Another platform's account changed, so this post went back to review. Re-approve it to publish.",
        locked_at: null,
        lock_token: null,
      })
      .eq("organisation_id", input.organisationId)
      .in("content_id", contentIds)
      .in("status", ["pending", "ready", "retrying"])
      .select("id, content_platform_id");
    if (siblingError) {
      throw new Error(`Could not hold other platforms: ${siblingError.message}`);
    }
    const siblingRows = (siblings || [])
      .map((j) => j.content_platform_id)
      .filter((id): id is string => Boolean(id));
    if (siblingRows.length) {
      const { error: sibCpError } = await admin
        .from("content_platforms")
        .update({ publish_status: "held" })
        .in("id", siblingRows);
      if (sibCpError) {
        throw new Error(`Could not mark platform rows held: ${sibCpError.message}`);
      }
    }
    siblingHeld = (siblings || []).map((j) => j.id);

    // Last: moving a post out of approved also holds any remaining queued
    // jobs (content_material_edit_guard), so the siblings are held above
    // first to report them accurately.
    const { error: contentError } = await admin
      .from("content")
      .update({ status: "review" })
      .eq("organisation_id", input.organisationId)
      .in("id", contentIds)
      .in("status", ["approved", "scheduled", "failed"]);
    if (contentError) {
      throw new Error(`Could not return posts to review: ${contentError.message}`);
    }
  }

  return {
    heldJobIds: (held || []).map((j) => j.id),
    otherPlatformJobIds: siblingHeld,
    flaggedProcessingJobIds: (flagged || []).map((j) => j.id),
    contentIds,
  };
}
