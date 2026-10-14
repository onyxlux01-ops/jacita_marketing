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
 * - the affected content goes back to `review`.
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
    .select("id, content_id");
  if (holdError) throw new Error(`Could not hold queued posts: ${holdError.message}`);

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
  if (contentIds.length) {
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
    flaggedProcessingJobIds: (flagged || []).map((j) => j.id),
    contentIds,
  };
}
