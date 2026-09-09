import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPayloadSnapshot,
  processDuePublishJobsReliable,
  processClaimedPublishJob,
  claimPublishJob,
  buildIdempotencyKey,
} from "@/lib/social/reliability";
import { randomBytes } from "crypto";

/**
 * Process due publish jobs with locking, retries, and idempotency.
 * Invoked by /api/cron/publish-due — not the browser.
 */
export async function processDuePublishJobs(limit = 15) {
  return processDuePublishJobsReliable(limit);
}

/**
 * Enqueue publish jobs for content platforms.
 * Snapshots content version so later edits cannot silently publish stale copy.
 */
export async function enqueuePublishJobsForContent(input: {
  organisationId: string;
  contentId: string;
  scheduledAt: string;
  userId: string;
}) {
  const admin = createAdminClient();
  const snapshot = await buildPayloadSnapshot(
    admin,
    input.contentId,
    input.organisationId
  );

  const { data: platforms } = await admin
    .from("content_platforms")
    .select("id, platform")
    .eq("content_id", input.contentId);

  const { data: accounts } = await admin
    .from("social_accounts")
    .select("id, platform, connection_status, organisation_id")
    .eq("organisation_id", input.organisationId)
    .eq("connection_status", "connected");

  const byPlatform = new Map(
    (accounts || []).map((a) => [a.platform, a] as const)
  );

  // Cancel prior pending/retrying jobs for this content before creating new ones
  await admin
    .from("social_publish_jobs")
    .update({
      status: "cancelled",
      error_message: "Rescheduled or replaced",
      error_type: "STALE_CONTENT",
    })
    .eq("content_id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .in("status", ["pending", "ready", "retrying"]);

  const versionHash = snapshot?.versionHash || null;
  const payload = (snapshot?.snapshot || {}) as Record<string, unknown>;
  const created: string[] = [];

  for (const cp of platforms || []) {
    const account = byPlatform.get(cp.platform);
    if (!account) continue;
    if (account.organisation_id !== input.organisationId) continue;

    await admin
      .from("content_platforms")
      .update({
        publish_status: "scheduled",
        scheduled_at: input.scheduledAt,
        social_account_id: account.id,
        error_message: null,
      })
      .eq("id", cp.id);

    const idempotencyKey = versionHash
      ? buildIdempotencyKey({
          organisationId: input.organisationId,
          contentId: input.contentId,
          socialAccountId: account.id,
          versionHash,
        })
      : null;

    const { data: job } = await admin
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

    if (job?.id) created.push(job.id);
  }

  return { jobIds: created };
}

/**
 * Manual "Publish now" through the same reliability engine as cron/autopilot.
 * Creates (or reuses) a due job, claims it, and processes it — never a second path.
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
    .select("id, organisation_id")
    .eq("id", input.contentId)
    .maybeSingle();
  if (!content) return { error: "Content not found" };

  const { data: membership } = await admin
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", content.organisation_id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!membership) return { error: "Unauthorized for this business" };

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

  let contentPlatformId = input.contentPlatformId || null;
  if (!contentPlatformId) {
    const { data: cp } = await admin
      .from("content_platforms")
      .select("id, external_post_id, publish_status")
      .eq("content_id", content.id)
      .eq("platform", account.platform)
      .maybeSingle();
    if (cp?.external_post_id && cp.publish_status === "published") {
      return {
        success: true as const,
        externalPostId: cp.external_post_id,
        status: "published" as const,
        duplicate: true,
      };
    }
    contentPlatformId = cp?.id || null;
  } else {
    const { data: cp } = await admin
      .from("content_platforms")
      .select("external_post_id, publish_status")
      .eq("id", contentPlatformId)
      .maybeSingle();
    if (cp?.external_post_id && cp.publish_status === "published") {
      return {
        success: true as const,
        externalPostId: cp.external_post_id,
        status: "published" as const,
        duplicate: true,
      };
    }
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
    });
    // Prefer the job for this specific account
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
    jobId = justCreated?.id || enqueued.jobIds[0] || null;
  }

  if (!jobId) {
    return {
      error:
        "Could not create a publish job. Ensure this content targets the connected platform.",
    };
  }

  if (input.tiktokPrivacyLevel) {
    // Stash on job payload if needed later — TikTok path already reads env/defaults
  }

  await admin
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
    .eq("organisation_id", content.organisation_id);

  const lockToken = randomBytes(16).toString("hex");
  const claimed = await claimPublishJob(admin, jobId, lockToken);
  if (!claimed) {
    return { error: "Could not claim publish job (another worker holds it)" };
  }

  return processClaimedPublishJob(admin, claimed, { force: true });
}

/**
 * Manual publish/retry through the same reliability engine.
 */
export async function retryPublishJob(input: {
  jobId: string;
  organisationId: string;
  userId: string;
  force?: boolean;
}) {
  const admin = createAdminClient();
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

  // Reset for manual retry
  await admin
    .from("social_publish_jobs")
    .update({
      status: "ready",
      error_message: null,
      error_type: null,
      next_retry_at: null,
      locked_at: null,
      lock_token: null,
    })
    .eq("id", job.id);

  const lockToken = randomBytes(16).toString("hex");
  const claimed = await claimPublishJob(admin, job.id, lockToken);
  if (!claimed) return { error: "Could not claim job (another worker holds it)" };

  // Ensure creator for auth context
  if (!claimed.created_by) {
    await admin
      .from("social_publish_jobs")
      .update({ created_by: input.userId })
      .eq("id", claimed.id);
    claimed.created_by = input.userId;
  }

  return processClaimedPublishJob(admin, claimed, {
    force: input.force ?? true,
  });
}
