import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPayloadSnapshot,
  processDuePublishJobsReliable,
  processClaimedPublishJob,
  claimPublishJob,
  buildIdempotencyKey,
} from "@/lib/social/reliability";
import {
  contentStatusAllows,
  getPublisherRole,
  resolveContentPlatform,
} from "@/lib/social/publish-authz";
import type { SocialPlatform } from "@/lib/types";
import { randomBytes } from "crypto";

/**
 * Process due publish jobs with locking, retries, and idempotency.
 * Invoked by /api/cron/publish-due — not the browser.
 */
export async function processDuePublishJobs(limit = 15) {
  return processDuePublishJobsReliable(limit);
}

export type EnqueueResult = { jobIds: string[]; error?: string };

/**
 * Enqueue publish jobs for content platforms (service role).
 *
 * Authorisation is enforced here, not only in callers: `userId` must be an
 * owner/manager of the business and the content must already be approved /
 * scheduled (or a failed post being retried). Every write result is checked.
 * Snapshots content version so later edits cannot silently publish stale copy.
 */
export async function enqueuePublishJobsForContent(input: {
  organisationId: string;
  contentId: string;
  scheduledAt: string;
  userId: string;
  /** Limit to these platforms (manual "Publish now" for one account). */
  platforms?: SocialPlatform[];
}): Promise<EnqueueResult> {
  const admin = createAdminClient();

  if (Number.isNaN(new Date(input.scheduledAt).getTime())) {
    return { jobIds: [], error: "Invalid schedule time" };
  }

  let role;
  try {
    role = await getPublisherRole(admin, input.organisationId, input.userId);
  } catch (e) {
    return { jobIds: [], error: e instanceof Error ? e.message : "Membership lookup failed" };
  }
  if (!role) {
    return {
      jobIds: [],
      error: "Only owners and managers can queue content for publishing",
    };
  }

  const { data: content, error: contentError } = await admin
    .from("content")
    .select("id, status")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();
  if (contentError) return { jobIds: [], error: contentError.message };
  if (!content) return { jobIds: [], error: "Content not found for this business" };
  if (!contentStatusAllows(content.status, "enqueue")) {
    return {
      jobIds: [],
      error: "Approve this content before it can be scheduled or published",
    };
  }

  const snapshot = await buildPayloadSnapshot(
    admin,
    input.contentId,
    input.organisationId
  );
  if (!snapshot) return { jobIds: [], error: "Content not found for this business" };

  const { data: platforms, error: platformsError } = await admin
    .from("content_platforms")
    .select("id, platform")
    .eq("content_id", input.contentId);
  if (platformsError) return { jobIds: [], error: platformsError.message };

  const { data: accounts, error: accountsError } = await admin
    .from("social_accounts")
    .select("id, platform, connection_status, organisation_id, external_account_id")
    .eq("organisation_id", input.organisationId)
    .eq("connection_status", "connected");
  if (accountsError) return { jobIds: [], error: accountsError.message };

  const byPlatform = new Map(
    (accounts || []).map((a) => [a.platform, a] as const)
  );

  // Cancel prior queued / held jobs for this content before creating new ones
  // (re-queueing is how held jobs get re-approved).
  let cancelQuery = admin
    .from("social_publish_jobs")
    .update({
      status: "cancelled",
      error_message: "Rescheduled or replaced",
      error_type: "STALE_CONTENT",
    })
    .eq("content_id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .in("status", ["pending", "ready", "retrying", "held"]);
  if (input.platforms?.length) {
    cancelQuery = cancelQuery.in("platform", input.platforms);
  }
  const { error: cancelError } = await cancelQuery;
  if (cancelError) return { jobIds: [], error: cancelError.message };

  const versionHash = snapshot.versionHash;
  const payload = (snapshot.snapshot || {}) as Record<string, unknown>;
  const created: string[] = [];
  const errors: string[] = [];

  for (const cp of platforms || []) {
    if (input.platforms?.length && !input.platforms.includes(cp.platform)) {
      continue;
    }
    const account = byPlatform.get(cp.platform);
    if (!account) continue;
    if (account.organisation_id !== input.organisationId) continue;

    const { error: cpError } = await admin
      .from("content_platforms")
      .update({
        publish_status: "scheduled",
        scheduled_at: input.scheduledAt,
        social_account_id: account.id,
        error_message: null,
      })
      .eq("id", cp.id)
      .eq("content_id", input.contentId);
    if (cpError) {
      errors.push(`${cp.platform}: ${cpError.message}`);
      continue;
    }

    const idempotencyKey = buildIdempotencyKey({
      organisationId: input.organisationId,
      contentId: input.contentId,
      socialAccountId: account.id,
      versionHash,
    });

    const { data: job, error: jobError } = await admin
      .from("social_publish_jobs")
      .insert({
        organisation_id: input.organisationId,
        content_id: input.contentId,
        content_platform_id: cp.id,
        social_account_id: account.id,
        platform: cp.platform,
        scheduled_at: input.scheduledAt,
        status: "pending",
        max_attempts: 4,
        created_by: input.userId,
        content_version_hash: versionHash,
        payload_snapshot: payload as import("@/lib/database.types").Json,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();

    if (jobError || !job?.id) {
      errors.push(`${cp.platform}: ${jobError?.message || "job not created"}`);
      continue;
    }
    created.push(job.id);
  }

  return errors.length
    ? { jobIds: created, error: `Could not queue every platform (${errors.join("; ")})` }
    : { jobIds: created };
}

/**
 * Manual "Publish now" through the same reliability engine as cron.
 * Requires an owner/manager and approved/scheduled (or failed, for retry)
 * content. The platform row is derived on the server. `force` here is the
 * explicit, authorised manual override of the automation-mode hold only.
 */
export async function publishContentViaJobPipeline(input: {
  contentId: string;
  socialAccountId: string;
  contentPlatformId?: string | null;
  tiktokPrivacyLevel?: string | null;
  userId: string;
}) {
  const admin = createAdminClient();

  const { data: content } = await admin
    .from("content")
    .select("id, organisation_id, status")
    .eq("id", input.contentId)
    .maybeSingle();
  if (!content) return { error: "Content not found" };

  let role;
  try {
    role = await getPublisherRole(admin, content.organisation_id, input.userId);
  } catch {
    return { error: "Could not verify your role for this business" };
  }
  if (!role) {
    return { error: "Only owners and managers can publish content" };
  }
  if (!contentStatusAllows(content.status, "enqueue")) {
    return { error: "Approve this content before publishing it" };
  }

  const { data: account } = await admin
    .from("social_accounts")
    .select("id, organisation_id, platform, connection_status")
    .eq("id", input.socialAccountId)
    .maybeSingle();
  if (!account) return { error: "Social account not found" };
  if (account.organisation_id !== content.organisation_id) {
    return {
      error:
        "Cannot publish: content and social account belong to different businesses",
    };
  }
  if (account.connection_status !== "connected") {
    return { error: "Reconnect this social account before publishing." };
  }

  // Derive the platform row from (content, platform); reject a mismatching
  // caller-supplied id BEFORE any duplicate check or write.
  const cp = await resolveContentPlatform(admin, {
    contentId: content.id,
    platform: account.platform,
    suppliedId: input.contentPlatformId,
  });
  if (!cp.ok) return { error: cp.error };
  const contentPlatformId = cp.row.id;

  if (cp.row.external_post_id && cp.row.publish_status === "published") {
    return {
      success: true as const,
      externalPostId: cp.row.external_post_id,
      status: "published" as const,
      duplicate: true,
    };
  }

  // Prefer an existing active job for this content+account
  const { data: existingJob } = await admin
    .from("social_publish_jobs")
    .select("id, external_post_id, published_at, status")
    .eq("content_id", content.id)
    .eq("social_account_id", account.id)
    .eq("organisation_id", content.organisation_id)
    .in("status", ["pending", "ready", "retrying", "processing", "published"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJob?.external_post_id || existingJob?.status === "published") {
    return {
      success: true as const,
      externalPostId: existingJob.external_post_id || "",
      status: "published" as const,
      duplicate: true,
    };
  }

  let jobId = existingJob?.id || null;
  if (!jobId) {
    const enqueued = await enqueuePublishJobsForContent({
      organisationId: content.organisation_id,
      contentId: content.id,
      scheduledAt: new Date().toISOString(),
      userId: input.userId,
      platforms: [account.platform],
    });
    // Only ever use the job for THIS account — never another platform's job.
    const { data: justCreated } = await admin
      .from("social_publish_jobs")
      .select("id")
      .eq("content_id", content.id)
      .eq("social_account_id", account.id)
      .eq("organisation_id", content.organisation_id)
      .in("status", ["pending", "ready"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    jobId = justCreated?.id || null;
    if (!jobId) {
      return {
        error:
          enqueued.error ||
          `Could not create a publish job for this ${account.platform} account. Ensure this content targets ${account.platform}.`,
      };
    }
  }

  if (input.tiktokPrivacyLevel) {
    // Stash on job payload if needed later — TikTok path already reads env/defaults
  }

  const { data: reset, error: resetError } = await admin
    .from("social_publish_jobs")
    .update({
      status: "ready",
      scheduled_at: new Date().toISOString(),
      next_retry_at: null,
      locked_at: null,
      lock_token: null,
      created_by: input.userId,
      content_platform_id: contentPlatformId,
    })
    .eq("id", jobId)
    .eq("organisation_id", content.organisation_id)
    .select("id");
  if (resetError) return { error: resetError.message };
  if (!reset?.length) return { error: "Publish job could not be prepared" };

  const lockToken = randomBytes(16).toString("hex");
  const claimed = await claimPublishJob(admin, jobId, lockToken);
  if (!claimed) {
    return { error: "Could not claim publish job (another worker holds it)" };
  }

  return processClaimedPublishJob(admin, claimed, { force: true });
}

/**
 * Manual retry of a specific job through the same reliability engine.
 * Requires an owner/manager; the retrying user becomes the job's actor.
 */
export async function retryPublishJob(input: {
  jobId: string;
  organisationId: string;
  userId: string;
  force?: boolean;
}) {
  const admin = createAdminClient();

  let role;
  try {
    role = await getPublisherRole(admin, input.organisationId, input.userId);
  } catch {
    return { error: "Could not verify your role for this business" };
  }
  if (!role) return { error: "Only owners and managers can retry publishing" };

  const { data: job } = await admin
    .from("social_publish_jobs")
    .select("*")
    .eq("id", input.jobId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!job) return { error: "Job not found for this business" };

  if (job.external_post_id || job.published_at) {
    return { error: "Already published — duplicate blocked", duplicate: true };
  }

  const { data: content } = await admin
    .from("content")
    .select("status")
    .eq("id", job.content_id)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();
  if (!content || !contentStatusAllows(content.status, "enqueue")) {
    return { error: "Approve this content again before retrying" };
  }

  // Reset for manual retry; the authorised retrier becomes the actor.
  const { data: reset, error: resetError } = await admin
    .from("social_publish_jobs")
    .update({
      status: "ready",
      error_message: null,
      error_type: null,
      hold_reason: null,
      held_at: null,
      next_retry_at: null,
      locked_at: null,
      lock_token: null,
      created_by: input.userId,
    })
    .eq("id", job.id)
    .eq("organisation_id", input.organisationId)
    .select("id");
  if (resetError) return { error: resetError.message };
  if (!reset?.length) return { error: "Job could not be reset for retry" };

  const lockToken = randomBytes(16).toString("hex");
  const claimed = await claimPublishJob(admin, job.id, lockToken);
  if (!claimed) return { error: "Could not claim job (another worker holds it)" };

  return processClaimedPublishJob(admin, claimed, {
    force: input.force ?? false,
  });
}
