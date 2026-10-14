import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPayloadSnapshot,
  processDuePublishJobsReliable,
  processClaimedPublishJob,
  claimPublishJob,
  newLockToken,
} from "@/lib/social/reliability";
import {
  contentStatusAllows,
  getPublisherRole,
  resolveContentPlatform,
} from "@/lib/social/publish-authz";
import type { SocialPlatform } from "@/lib/types";
import type { Json } from "@/lib/database.types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Process due publish jobs with locking, retries, and idempotency.
 * Invoked by /api/cron/publish-due — not the browser.
 */
export async function processDuePublishJobs(limit = 15) {
  return processDuePublishJobsReliable(limit);
}

/**
 * Jobs that have not started and can be cancelled outright (reject,
 * emergency stop). Never `processing` (in flight) or `uncertain` (may be
 * live: a person must check it first).
 */
export const CANCELLABLE_JOB_STATUSES = ["pending", "ready", "retrying", "held"] as const;

/**
 * For IMPLICIT schedule times only (an AI-suggested time, the post's stored
 * time when approving): the scheduler refuses past times, so a missing or
 * passed time becomes "soon" instead. A time the user typed is never bumped;
 * it goes to the scheduler as-is and a past one is rejected with a message.
 */
export function upcomingScheduleTime(
  preferred: string | null | undefined,
  opts: { now?: number; fallbackMs?: number; bumpMs?: number } = {}
) {
  const now = opts.now ?? Date.now();
  const t = preferred ? new Date(preferred).getTime() : Number.NaN;
  if (Number.isNaN(t)) {
    return new Date(now + (opts.fallbackMs ?? 60 * 60_000)).toISOString();
  }
  if (t > now + 60_000) return new Date(t).toISOString();
  return new Date(now + (opts.bumpMs ?? 15 * 60_000)).toISOString();
}

export type SchedulePlatformResult = {
  platform: SocialPlatform;
  /** uncertain_pending: an earlier attempt may be live; nothing queued. */
  status: "queued" | "no_account" | "uncertain_pending";
  job_id?: string;
  social_account_id?: string;
};

export type EnqueueResult = {
  jobIds: string[];
  error?: string;
  code?: string;
  platforms?: SchedulePlatformResult[];
};

type ScheduleRpcResult = {
  ok: boolean;
  error?: string;
  code?: string;
  organisation_id?: string;
  platforms?: SchedulePlatformResult[];
};

/**
 * Schedule (queue) publish jobs for a post through the schedule_content RPC:
 * target validation, job replacement and content/platform status updates
 * happen in ONE database transaction. If no connected account matches, or
 * any insert fails, nothing changes (old jobs are kept).
 *
 * The RPC re-checks that `userId` is an owner/manager and that the content is
 * approved / scheduled / failed, so every caller (UI actions, approval,
 * automation, Publish now) gets the same rules. The content's version is
 * snapshotted so later edits cannot silently publish stale copy.
 */
export async function enqueuePublishJobsForContent(input: {
  organisationId: string;
  contentId: string;
  scheduledAt: string;
  userId: string;
  /** Limit to these platforms (manual "Publish now" for one account). */
  platforms?: SocialPlatform[];
  /** Allow "now" (Publish now) instead of rejecting past timestamps. */
  allowImmediate?: boolean;
}): Promise<EnqueueResult> {
  const admin = createAdminClient();

  const when = new Date(input.scheduledAt);
  if (!input.scheduledAt || Number.isNaN(when.getTime())) {
    return { jobIds: [], error: "Invalid schedule time", code: "INVALID_TIME" };
  }

  // Also proves the content belongs to this business.
  const snapshot = await buildPayloadSnapshot(
    admin,
    input.contentId,
    input.organisationId
  );
  if (!snapshot) {
    return { jobIds: [], error: "Content not found for this business", code: "NOT_FOUND" };
  }

  const { data, error } = await admin.rpc("schedule_content", {
    p_content_id: input.contentId,
    p_scheduled_at: when.toISOString(),
    p_actor_user_id: input.userId,
    p_version_hash: snapshot.versionHash,
    p_payload_snapshot: snapshot.snapshot as Json,
    p_platforms: input.platforms?.length ? input.platforms : undefined,
    p_allow_immediate: Boolean(input.allowImmediate),
  });
  if (error) {
    console.error("schedule_content RPC failed", input.contentId, error.message);
    return { jobIds: [], error: "Could not schedule this post. Try again.", code: "RPC_ERROR" };
  }

  const result = data as unknown as ScheduleRpcResult;
  if (!result?.ok) {
    if (result?.code === "SCHEDULE_FAILED") {
      // The database logged the details (raise warning).
      console.error("schedule_content failed", input.contentId);
    }
    return {
      jobIds: [],
      error: result?.error || "Could not schedule this post",
      code: result?.code,
      platforms: result?.platforms,
    };
  }
  const platforms = result.platforms ?? [];
  return {
    jobIds: platforms
      .filter((p) => p.status === "queued" && p.job_id)
      .map((p) => p.job_id as string),
    platforms,
  };
}

/** Human summary of platforms that could not be queued. */
export function describeSkippedPlatforms(result: EnqueueResult) {
  const all = result.platforms ?? [];
  const noAccount = all.filter((p) => p.status === "no_account").map((p) => p.platform);
  const uncertain = all.filter((p) => p.status === "uncertain_pending").map((p) => p.platform);
  const parts: string[] = [];
  if (noAccount.length) {
    parts.push(`Not queued for ${noAccount.join(", ")} (no connected account).`);
  }
  if (uncertain.length) {
    parts.push(
      `Not queued for ${uncertain.join(", ")}: an earlier attempt may already be live. Check it, then retry that job.`
    );
  }
  return parts.length ? parts.join(" ") : null;
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
    .select("id, organisation_id, platform, connection_status, external_account_id")
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

  // A post whose last attempt has an unknown outcome may already be live:
  // never start another one until a person has checked and retried that job.
  const { data: uncertainJob, error: uncertainError } = await admin
    .from("social_publish_jobs")
    .select("id")
    .eq("content_id", content.id)
    .eq("social_account_id", account.id)
    .eq("organisation_id", content.organisation_id)
    .eq("status", "uncertain")
    .limit(1)
    .maybeSingle();
  if (uncertainError) return { error: uncertainError.message };
  if (uncertainJob) return uncertainPending(account.platform);

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

  // A job that is already processing is never reset or re-claimed.
  if (existingJob?.status === "processing") {
    return IN_PROGRESS;
  }

  let jobId = existingJob?.id || null;
  if (!jobId) {
    const enqueued = await enqueuePublishJobsForContent({
      organisationId: content.organisation_id,
      contentId: content.id,
      scheduledAt: new Date().toISOString(),
      userId: input.userId,
      platforms: [account.platform],
      allowImmediate: true,
    });
    if (enqueued.code === "ALREADY_PUBLISHING") return IN_PROGRESS;
    if (enqueued.code === "UNCERTAIN_PENDING") return uncertainPending(account.platform);
    // Only ever use the job for THIS account — never another platform's job.
    jobId =
      enqueued.platforms?.find(
        (p) => p.status === "queued" && p.social_account_id === account.id
      )?.job_id ?? null;
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

  // Prepare (only from a queued state — never touches a processing job).
  const { data: reset, error: resetError } = await admin
    .from("social_publish_jobs")
    .update({
      status: "ready",
      scheduled_at: new Date().toISOString(),
      next_retry_at: null,
      created_by: input.userId,
      content_platform_id: contentPlatformId,
      // Explicit manual publish targets the account connected right now.
      target_external_account_id: account.external_account_id,
    })
    .eq("id", jobId)
    .eq("organisation_id", content.organisation_id)
    .in("status", ["pending", "ready", "retrying"])
    .select("id");
  if (resetError) return { error: resetError.message };
  if (!reset?.length) return jobStateAfterLostRace(admin, jobId);

  const claimed = await claimPublishJob(admin, jobId, newLockToken(), ["ready"]);
  if (!claimed) return jobStateAfterLostRace(admin, jobId);

  return processClaimedPublishJob(admin, claimed, { force: true });
}

const IN_PROGRESS = {
  inProgress: true as const,
  status: "processing" as const,
  message: "This post is already being published. Check back in a moment.",
};

function uncertainPending(platform: string) {
  return {
    error: `The last ${platform} attempt for this post may already be live. Check ${platform}, then use "Retry" on that job and confirm it is not live.`,
    code: "UNCERTAIN_PENDING" as const,
  };
}

/** Another request/worker got the job first: report what it is doing. */
async function jobStateAfterLostRace(admin: Admin, jobId: string) {
  const { data } = await admin
    .from("social_publish_jobs")
    .select("status, external_post_id")
    .eq("id", jobId)
    .maybeSingle();
  if (data?.status === "processing") return IN_PROGRESS;
  if (data?.status === "published") {
    return {
      success: true as const,
      externalPostId: data.external_post_id || "",
      status: "published" as const,
      duplicate: true,
    };
  }
  return {
    error: `This publish job is ${data?.status ?? "unavailable"} and was not started.`,
  };
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
  /**
   * Required to retry an `uncertain` job: the person confirms they checked
   * the platform and the post is NOT live. Without it the retry is refused.
   */
  confirmNotLive?: boolean;
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
  if (job.status === "processing") return IN_PROGRESS;
  const wasUncertain = job.status === "uncertain";
  if (wasUncertain && input.confirmNotLive !== true) {
    return {
      error: `This ${job.platform} post may already be live. Check ${job.platform} first, then confirm it is not live to retry.`,
      code: "CONFIRM_NOT_LIVE_REQUIRED" as const,
      needsConfirmation: true as const,
    };
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

  // The authorised retrier approves the account connected NOW: record it as
  // the job's target (the worker holds jobs without one).
  const { data: account } = await admin
    .from("social_accounts")
    .select("external_account_id, organisation_id")
    .eq("id", job.social_account_id)
    .maybeSingle();
  if (!account || account.organisation_id !== input.organisationId) {
    return { error: "Social account not found for this business" };
  }

  // Record the person's "not live" confirmation before anything runs.
  if (wasUncertain) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      organisation_id: input.organisationId,
      user_id: input.userId,
      action: "publish_job.retry_uncertain_confirmed_not_live",
      entity_type: "social_publish_job",
      entity_id: job.id,
      metadata: {
        platform: job.platform,
        content_id: job.content_id,
        previous_error: job.error_message,
      },
    });
    if (auditError) {
      // Fail closed: no retry of a possibly-live post without the record.
      return { error: `Could not record the confirmation: ${auditError.message}` };
    }
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
      created_by: input.userId,
      target_external_account_id: account.external_account_id,
    })
    .eq("id", job.id)
    .eq("organisation_id", input.organisationId)
    // Never from processing/published/cancelled. `uncertain` only when the
    // person confirmed above that the post is not live.
    .in(
      "status",
      wasUncertain
        ? ["uncertain"]
        : ["failed", "retrying", "expired", "held", "pending", "ready"]
    )
    .select("id");
  if (resetError) return { error: resetError.message };
  if (!reset?.length) return jobStateAfterLostRace(admin, job.id);

  const claimed = await claimPublishJob(admin, job.id, newLockToken(), ["ready"]);
  if (!claimed) return jobStateAfterLostRace(admin, job.id);

  return processClaimedPublishJob(admin, claimed, {
    force: input.force ?? false,
  });
}
