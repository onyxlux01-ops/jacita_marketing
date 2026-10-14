import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishContent } from "@/lib/social/publish";
import { getSocialAdapter } from "@/lib/social/registry";
import { loadAccountSecrets } from "@/lib/social/secrets";
import {
  buildIdempotencyKey,
  classifyPublishError,
  hashContentVersion,
  humanPublishMessage,
  retryDelayMs,
  type PublishErrorType,
} from "@/lib/social/errors";
import { isPublishingSimulationEnabled } from "@/lib/social/simulation";
import {
  contentStatusAllows,
  getPublisherRole,
} from "@/lib/social/publish-authz";
import { logAutomationActivity } from "@/lib/automation/settings";
import { notifyAutomationIssue } from "@/lib/automation/notify";
import type { Database, Json } from "@/lib/database.types";
import type { SocialPlatform } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

const LATE_PUBLISH_MS = 30 * 60 * 1000;
const EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;
/** Processing locks older than this are treated as abandoned (worker crash). */
const LOCK_TTL_MS = 15 * 60 * 1000;

async function observe(input: {
  organisationId: string;
  platform: string;
  jobId: string;
  contentId: string;
  attempt: number;
  result: string;
  errorType?: string | null;
  durationMs?: number;
}) {
  console.info(
    JSON.stringify({
      scope: "publishing",
      organisation_id: input.organisationId,
      platform: input.platform,
      job_id: input.jobId,
      content_id: input.contentId,
      attempt: input.attempt,
      result: input.result,
      error_type: input.errorType || null,
      duration_ms: input.durationMs ?? null,
      simulated: isPublishingSimulationEnabled(),
    })
  );
}

async function automationAllowsPublish(
  admin: Admin,
  organisationId: string,
  force: boolean
): Promise<{
  ok: boolean;
  errorType?: PublishErrorType;
  message?: string;
  hold?: boolean;
}> {
  if (force) return { ok: true };

  const { data: settings } = await admin
    .from("automation_settings")
    .select("enabled, paused, mode")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (settings?.paused) {
    return {
      ok: false,
      errorType: "AUTOMATION_PAUSED",
      message: "Automation is paused — scheduled publish held.",
      hold: true,
    };
  }

  if (settings?.mode === "off" || settings?.enabled === false) {
    return {
      ok: false,
      errorType: "MODE_BLOCKED",
      message: "Automation is off — automated publishing is held.",
      hold: true,
    };
  }

  if (settings?.mode === "manual") {
    return {
      ok: false,
      errorType: "MODE_BLOCKED",
      message: "Manual mode — automatic publishing is disabled.",
      hold: true,
    };
  }

  return { ok: true };
}

export type HoldReason =
  | "MISSING_ACTOR"
  | "ACTOR_NOT_AUTHORISED"
  | "CONTENT_NOT_APPROVED"
  | "ACCOUNT_CHANGED"
  | "MISSING_TARGET";

/**
 * Park a claimed job in `held` until someone authorised re-approves /
 * re-queues it. Held jobs are never picked up by the cron worker.
 */
export async function holdPublishJob(
  admin: Admin,
  job: {
    id: string;
    organisation_id: string;
    platform: string;
    content_platform_id?: string | null;
    lock_token?: string | null;
  },
  reason: HoldReason,
  message: string
) {
  // Only the lock holder may hold the job. If the write fails the job stays
  // locked in processing (never executed); request_sent_at is unset, so the
  // abandoned-lock recovery will retry it safely and re-run the gates.
  const ok = await updateLockedJob(admin, job, {
    status: "held",
    hold_reason: reason,
    held_at: new Date().toISOString(),
    error_type: "PERMISSION_ERROR",
    error_code: reason,
    error_message: message,
    locked_at: null,
    lock_token: null,
  });
  if (ok && job.content_platform_id) {
    // Calendar / content page must not keep showing it as scheduled.
    const { error: cpError } = await admin
      .from("content_platforms")
      .update({ publish_status: "held", error_message: message })
      .eq("id", job.content_platform_id);
    if (cpError) {
      console.error(
        JSON.stringify({ scope: "publishing", job_id: job.id, cp_hold_failed: cpError.message })
      );
    }
  }

  await logAutomationActivity(admin, {
    organisationId: job.organisation_id,
    eventType: "publish_held",
    message,
    severity: "warning",
    metadata: { job_id: job.id, reason },
  });
  return { held: true as const, reason };
}

/**
 * Execution-time authorisation. Cron and automation run with the service
 * role and act as the job's `created_by`, so re-check that the actor still
 * holds a publishing role and the content is still approved/scheduled.
 */
async function executionGate(
  admin: Admin,
  job: {
    id: string;
    organisation_id: string;
    content_id: string;
    platform: string;
    created_by: string | null;
  }
): Promise<{ ok: true } | { ok: false; reason: HoldReason; message: string }> {
  if (!job.created_by) {
    return {
      ok: false,
      reason: "MISSING_ACTOR",
      message: "This post has no authorising user. Re-approve it to publish.",
    };
  }
  const role = await getPublisherRole(admin, job.organisation_id, job.created_by);
  if (!role) {
    return {
      ok: false,
      reason: "ACTOR_NOT_AUTHORISED",
      message:
        "The person who queued this post no longer has publishing access. Re-approve it to publish.",
    };
  }
  const { data: content, error } = await admin
    .from("content")
    .select("status")
    .eq("id", job.content_id)
    .eq("organisation_id", job.organisation_id)
    .maybeSingle();
  if (error) throw new Error(`Content lookup failed: ${error.message}`);
  if (!content || !contentStatusAllows(content.status, "execute")) {
    return {
      ok: false,
      reason: "CONTENT_NOT_APPROVED",
      message: "This content is no longer approved. Re-approve it to publish.",
    };
  }
  return { ok: true };
}

/**
 * Snapshot content into the job at enqueue time for immutability checks.
 */
export async function buildPayloadSnapshot(
  admin: Admin,
  contentId: string,
  organisationId: string
) {
  const { data } = await admin
    .from("content")
    .select(
      "id, title, hook, caption, call_to_action, hashtags, media_asset_id, content_type, updated_at"
    )
    .eq("id", contentId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (!data) return null;

  const versionHash = hashContentVersion(data);
  return {
    versionHash,
    snapshot: {
      title: data.title,
      hook: data.hook,
      caption: data.caption,
      call_to_action: data.call_to_action,
      hashtags: data.hashtags,
      media_asset_id: data.media_asset_id,
      content_type: data.content_type,
      captured_at: new Date().toISOString(),
      content_updated_at: data.updated_at,
    },
  };
}

async function applyMissedSchedulePolicy(
  admin: Admin,
  job: {
    id: string;
    organisation_id: string;
    scheduled_at: string;
    platform: string;
  }
): Promise<"proceed" | "reschedule" | "expire"> {
  const scheduled = new Date(job.scheduled_at).getTime();
  const lateBy = Date.now() - scheduled;
  if (lateBy <= LATE_PUBLISH_MS) return "proceed";

  if (lateBy > EXPIRE_AFTER_MS) {
    await admin
      .from("social_publish_jobs")
      .update({
        status: "expired",
        missed_policy: "skip_too_late",
        error_type: "MISSED_SCHEDULE",
        error_code: "EXPIRED",
        error_message:
          "Scheduled time was missed by more than 6 hours. Skipped to avoid stale posting.",
      })
      .eq("id", job.id)
      .in("status", ["pending", "ready", "retrying"]);

    await logAutomationActivity(admin, {
      organisationId: job.organisation_id,
      eventType: "publish_expired",
      message: humanPublishMessage({
        platform: job.platform,
        errorType: "MISSED_SCHEDULE",
        message: "Skipped — too late to publish.",
      }),
      severity: "warning",
      metadata: { job_id: job.id },
    });
    return "expire";
  }

  // 30m–6h late: reschedule +2 hours from now
  const next = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await admin
    .from("social_publish_jobs")
    .update({
      status: "pending",
      scheduled_at: next,
      missed_policy: "reschedule_2h",
      error_type: "MISSED_SCHEDULE",
      error_message: `Missed schedule — rescheduled to ${next}`,
      locked_at: null,
      lock_token: null,
    })
    .eq("id", job.id)
    .in("status", ["pending", "ready", "retrying"]);

  await logAutomationActivity(admin, {
    organisationId: job.organisation_id,
    eventType: "publish_rescheduled",
    message: humanPublishMessage({
      platform: job.platform,
      errorType: "MISSED_SCHEDULE",
      message: "Rescheduled after a missed window.",
    }),
    severity: "info",
    metadata: { job_id: job.id, next },
  });
  return "reschedule";
}

type JobStatus = Database["public"]["Enums"]["publish_job_status"];
type JobUpdate = Database["public"]["Tables"]["social_publish_jobs"]["Update"];

export function newLockToken() {
  return randomBytes(16).toString("hex");
}

/**
 * Atomically claim a job via the claim_publish_job RPC (single UPDATE ...
 * WHERE status = ANY(allowed) RETURNING). Only one caller wins; a job that
 * is already `processing` is never claimable. Returns null when not won.
 */
export async function claimPublishJob(
  admin: Admin,
  jobId: string,
  lockToken: string,
  allowedStates: JobStatus[] = ["pending", "ready", "retrying"]
) {
  const { data, error } = await admin.rpc("claim_publish_job", {
    p_job_id: jobId,
    p_lock_token: lockToken,
    p_allowed_states: allowedStates,
  });
  if (error) throw new Error(`Could not claim publish job: ${error.message}`);
  return (data && data[0]) || null;
}

/**
 * Write to a job only while this worker still holds it: status must still be
 * `processing` and lock_token must match (null for rows already unlocked,
 * e.g. verified-later posts). Returns false if the lock was lost.
 */
export async function updateLockedJob(
  admin: Admin,
  job: { id: string; lock_token?: string | null },
  patch: JobUpdate
) {
  let query = admin
    .from("social_publish_jobs")
    .update(patch)
    .eq("id", job.id)
    .eq("status", "processing");
  query = job.lock_token
    ? query.eq("lock_token", job.lock_token)
    : query.is("lock_token", null);
  const { data, error } = await query.select("id");
  if (error || !data?.length) {
    console.error(
      JSON.stringify({
        scope: "publishing",
        job_id: job.id,
        lock_lost: true,
        error: error?.message ?? null,
        attempted_status: patch.status ?? null,
      })
    );
    return false;
  }
  return true;
}

/**
 * The provider may have received the post but we have no proof either way:
 * park the job as `uncertain` (never retried automatically, blocks any new
 * job for the same content + account) and tell a person to check.
 */
async function markUncertain(
  admin: Admin,
  job: {
    id: string;
    organisation_id: string;
    platform: string;
    lock_token?: string | null;
    content_platform_id?: string | null;
  },
  message: string,
  metadata: Record<string, unknown> = {}
) {
  const ok = await updateLockedJob(admin, job, {
    status: "uncertain",
    hold_reason: "UNCERTAIN_OUTCOME",
    held_at: new Date().toISOString(),
    locked_at: null,
    lock_token: null,
    error_type: "AMBIGUOUS_TIMEOUT",
    error_code: "UNCERTAIN_OUTCOME",
    error_message: message,
  });
  if (!ok) return false;
  if (job.content_platform_id) {
    await admin
      .from("content_platforms")
      .update({ publish_status: "held", error_message: message })
      .eq("id", job.content_platform_id);
  }
  await logAutomationActivity(admin, {
    organisationId: job.organisation_id,
    eventType: "publish_uncertain",
    message: humanPublishMessage({
      platform: job.platform,
      errorType: "AMBIGUOUS_TIMEOUT",
      message,
    }),
    severity: "error",
    metadata: { job_id: job.id, ...metadata },
  });
  await notifyAutomationIssue({
    organisationId: job.organisation_id,
    title: `${job.platform} post may already be live`,
    body: message,
  });
  return true;
}

async function markRetryOrFail(
  admin: Admin,
  job: {
    id: string;
    organisation_id: string;
    content_id: string;
    platform: string;
    attempt_count: number;
    max_attempts: number;
    social_account_id: string;
    lock_token?: string | null;
  },
  classified: {
    type: PublishErrorType;
    retryable: boolean;
    message: string;
    code?: string;
  }
) {
  const canRetry =
    classified.retryable && job.attempt_count < (job.max_attempts || 4);

  if (canRetry) {
    const delay = retryDelayMs(job.attempt_count);
    const nextRetry = new Date(Date.now() + delay).toISOString();
    const ok = await updateLockedJob(admin, job, {
      status: "retrying",
      next_retry_at: nextRetry,
      error_type: classified.type,
      error_code: classified.code || classified.type,
      error_message: classified.message,
      locked_at: null,
      lock_token: null,
    });
    if (!ok) return { lockLost: true as const };

    await logAutomationActivity(admin, {
      organisationId: job.organisation_id,
      eventType: "publish_retry",
      message: humanPublishMessage({
        platform: job.platform,
        errorType: classified.type,
        message: classified.message,
      }),
      severity: "warning",
      metadata: { job_id: job.id, next_retry_at: nextRetry },
    });
    return { retrying: true as const, nextRetry };
  }

  const failedOk = await updateLockedJob(admin, job, {
    status: "failed",
    error_type: classified.type,
    error_code: classified.code || classified.type,
    error_message: classified.message,
    locked_at: null,
    lock_token: null,
  });
  if (!failedOk) return { lockLost: true as const };

  if (
    classified.type === "AUTHENTICATION_ERROR" ||
    classified.type === "BLOCKED_ACCOUNT"
  ) {
    await admin
      .from("social_accounts")
      .update({
        connection_status:
          classified.type === "BLOCKED_ACCOUNT" ? "not_connected" : "expired",
        health_status: "reauth_required" as const,
        last_error: classified.message,
      } as never)
      .eq("id", job.social_account_id);
  }

  await logAutomationActivity(admin, {
    organisationId: job.organisation_id,
    eventType: "publish_failed",
    message: humanPublishMessage({
      platform: job.platform,
      errorType: classified.type,
      message: classified.message,
    }),
    severity: "error",
    metadata: { job_id: job.id, content_id: job.content_id },
  });

  await notifyAutomationIssue({
    organisationId: job.organisation_id,
    title: `${job.platform} publishing failed`,
    body: classified.message.slice(0, 280),
  });

  return { failed: true as const };
}

/**
 * Process a single claimed job through the full reliability flow.
 */
export async function processClaimedPublishJob(
  admin: Admin,
  job: {
    id: string;
    organisation_id: string;
    content_id: string;
    content_platform_id: string | null;
    social_account_id: string;
    platform: string;
    attempt_count: number;
    max_attempts: number;
    created_by: string | null;
    scheduled_at: string;
    external_post_id: string | null;
    published_at: string | null;
    content_version_hash: string | null;
    payload_snapshot: Json;
    idempotency_key: string | null;
    target_external_account_id?: string | null;
    /** Token from claim_publish_job; every write below must match it. */
    lock_token?: string | null;
  },
  options?: { force?: boolean }
) {
  const started = Date.now();
  const force = Boolean(options?.force);
  const simulated = isPublishingSimulationEnabled();

  // IDEMPOTENCY: never publish twice
  if (job.external_post_id || job.published_at) {
    await updateLockedJob(admin, job, {
      status: "published",
      error_type: "DUPLICATE_GUARD",
      error_message: "Already published — duplicate blocked.",
      locked_at: null,
      lock_token: null,
    });

    await observe({
      organisationId: job.organisation_id,
      platform: job.platform,
      jobId: job.id,
      contentId: job.content_id,
      attempt: job.attempt_count,
      result: "duplicate_blocked",
      errorType: "DUPLICATE_GUARD",
      durationMs: Date.now() - started,
    });

    return { success: true, duplicate: true };
  }

  // Also check content_platforms for existing external id
  if (job.content_platform_id) {
    const { data: cp } = await admin
      .from("content_platforms")
      .select("external_post_id, publish_status")
      .eq("id", job.content_platform_id)
      .maybeSingle();
    if (cp?.external_post_id && cp.publish_status === "published") {
      await updateLockedJob(admin, job, {
        status: "published",
        published_at: new Date().toISOString(),
        external_post_id: cp.external_post_id,
        error_type: "DUPLICATE_GUARD",
        error_message: "Platform row already published.",
        locked_at: null,
        lock_token: null,
      });
      return { success: true, duplicate: true };
    }
  }

  // Authorisation at execution time — never skipped, not even by `force`.
  const gate = await executionGate(admin, job);
  if (!gate.ok) {
    await observe({
      organisationId: job.organisation_id,
      platform: job.platform,
      jobId: job.id,
      contentId: job.content_id,
      attempt: job.attempt_count,
      result: "held",
      errorType: gate.reason,
      durationMs: Date.now() - started,
    });
    const held = await holdPublishJob(admin, job, gate.reason, gate.message);
    return { ...held, error: gate.message };
  }

  // `force` = explicit, already-authorised manual action: skip only the
  // automation mode / pause hold below.
  const modeGate = await automationAllowsPublish(
    admin,
    job.organisation_id,
    force
  );
  if (!modeGate.ok) {
    if (modeGate.hold) {
      await updateLockedJob(admin, job, {
        status: "pending",
        error_type: modeGate.errorType || null,
        error_message: modeGate.message,
        locked_at: null,
        lock_token: null,
        scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      return { held: true, reason: modeGate.errorType };
    }

    await markRetryOrFail(admin, job, {
      type: modeGate.errorType || "MODE_BLOCKED",
      retryable: false,
      message: modeGate.message || "Publishing blocked",
    });
    return { error: modeGate.message };
  }

  // Isolation: account must belong to same business
  const { data: account } = await admin
    .from("social_accounts")
    .select(
      "id, organisation_id, connection_status, platform, health_status, external_account_id"
    )
    .eq("id", job.social_account_id)
    .maybeSingle();

  if (!account || account.organisation_id !== job.organisation_id) {
    await markRetryOrFail(admin, job, {
      type: "BLOCKED_ACCOUNT",
      retryable: false,
      message: "Social account does not belong to this business. Aborted.",
    });
    return { error: "org_mismatch" };
  }

  if (
    account.connection_status !== "connected" ||
    account.health_status === "reauth_required" ||
    account.health_status === "disconnected"
  ) {
    await markRetryOrFail(admin, job, {
      type: "BLOCKED_ACCOUNT",
      retryable: false,
      message:
        account.health_status === "reauth_required"
          ? "Account authorization required. Reconnect before publishing."
          : "Social account is disconnected.",
    });
    return { error: "account_blocked" };
  }

  // Identity guard: the job was approved for a specific external account.
  // If the business switched Page / Instagram account since, never publish
  // to the new one without re-approval. A job with NO recorded target is
  // held too (fail closed) — it cannot prove which account it was approved for.
  if (!job.target_external_account_id) {
    const held = await holdPublishJob(
      admin,
      job,
      "MISSING_TARGET",
      "This post has no recorded target account. Re-approve it to publish."
    );
    return { ...held, error: "missing_target" };
  }
  if (account.external_account_id !== job.target_external_account_id) {
    const held = await holdPublishJob(
      admin,
      job,
      "ACCOUNT_CHANGED",
      "The connected account changed after this post was queued. Re-approve it for the new account."
    );
    return { ...held, error: "account_changed" };
  }

  // Stale content guard
  if (job.content_version_hash) {
    const fresh = await buildPayloadSnapshot(
      admin,
      job.content_id,
      job.organisation_id
    );
    if (fresh && fresh.versionHash !== job.content_version_hash) {
      await updateLockedJob(admin, job, {
        status: "cancelled",
        error_type: "STALE_CONTENT",
        error_code: "STALE_CONTENT",
        error_message:
          "Content was edited after scheduling. Re-queue to publish the latest version.",
        locked_at: null,
        lock_token: null,
      });

      await logAutomationActivity(admin, {
        organisationId: job.organisation_id,
        eventType: "publish_stale",
        message: humanPublishMessage({
          platform: job.platform,
          errorType: "STALE_CONTENT",
        }),
        severity: "warning",
        metadata: { job_id: job.id },
      });

      await notifyAutomationIssue({
        organisationId: job.organisation_id,
        title: "Scheduled post needs re-approval",
        body: "Content changed after it was queued. Re-approve to publish the latest version.",
      });

      return { error: "stale_content" };
    }
  }

  // executionGate() guaranteed an authorised actor.
  const actorId = job.created_by as string;

  const result = await publishContent({
    contentId: job.content_id,
    socialAccountId: job.social_account_id,
    contentPlatformId: job.content_platform_id,
    userId: actorId,
    system: true,
    publishJobId: job.id,
    simulated,
    expectedExternalAccountId: job.target_external_account_id ?? null,
    // Crash marker: from here the provider may have received the request.
    // If we lost the lock, abort before sending anything.
    onBeforeProviderRequest: () =>
      updateLockedJob(admin, job, { request_sent_at: new Date().toISOString() }),
  });

  if (!("success" in result) || !result.success) {
    const errResult = result as {
      error: string;
      errorType?: PublishErrorType;
      errorCode?: string;
      retryable?: boolean;
    };
    const classified =
      errResult.errorType
        ? {
            type: errResult.errorType,
            retryable: Boolean(errResult.retryable),
            message: errResult.error,
            code: errResult.errorCode,
          }
        : classifyPublishError(new Error(errResult.error));

    // Network timeout: try verify before retrying (avoid duplicates)
    if (classified.type === "NETWORK_ERROR") {
      if (job.content_platform_id) {
        const verified = await tryVerifyExistingPublish(
          admin,
          job.social_account_id,
          job.organisation_id,
          job.platform as SocialPlatform,
          job.content_platform_id
        );
        if (verified) {
          await updateLockedJob(admin, job, {
            status: "published",
            published_at: new Date().toISOString(),
            external_post_id: verified.externalPostId,
            external_url: verified.externalUrl || null,
            error_message: null,
            error_type: null,
            locked_at: null,
            lock_token: null,
            simulated,
          });

          await logAutomationActivity(admin, {
            organisationId: job.organisation_id,
            eventType: "publish_verified",
            message: humanPublishMessage({
              platform: job.platform,
              success: true,
              simulated,
            }).replace("published successfully", "publishing verified after timeout"),
            severity: "success",
            metadata: {
              job_id: job.id,
              external_post_id: verified.externalPostId,
              verified_after_timeout: true,
            },
          });

          return { success: true, verifiedAfterTimeout: true };
        }
      }

      // Ambiguous: Meta may have accepted the post but we have no external ID.
      // Do NOT blindly republish — hold for human attention.
      const ambiguous = {
        type: "AMBIGUOUS_TIMEOUT" as const,
        retryable: false,
        message:
          "Publish timed out before we received a post ID. Check Instagram/Facebook for a possible live post before retrying.",
        code: "AMBIGUOUS_TIMEOUT",
      };

      await admin.from("social_publish_logs").insert({
        organisation_id: job.organisation_id,
        content_id: job.content_id,
        content_platform_id: job.content_platform_id,
        social_account_id: job.social_account_id,
        publish_job_id: job.id,
        platform: job.platform as SocialPlatform,
        started_at: new Date(started).toISOString(),
        completed_at: new Date().toISOString(),
        status: "failed",
        error_message: ambiguous.message,
        error_type: ambiguous.type,
        attempt_count: job.attempt_count,
        duration_ms: Date.now() - started,
        request_summary: { simulated, ambiguous: true },
      });

      // Not "failed": a failed job could be retried with one click.
      await markUncertain(admin, job, ambiguous.message, { ambiguous_timeout: true });
      await observe({
        organisationId: job.organisation_id,
        platform: job.platform,
        jobId: job.id,
        contentId: job.content_id,
        attempt: job.attempt_count,
        result: "ambiguous_timeout",
        errorType: "AMBIGUOUS_TIMEOUT",
        durationMs: Date.now() - started,
      });
      return {
        error: ambiguous.message,
        errorType: "AMBIGUOUS_TIMEOUT" as const,
        ambiguous: true,
      };
    }

    await admin.from("social_publish_logs").insert({
      organisation_id: job.organisation_id,
      content_id: job.content_id,
      content_platform_id: job.content_platform_id,
      social_account_id: job.social_account_id,
      publish_job_id: job.id,
      platform: job.platform as SocialPlatform,
      started_at: new Date(started).toISOString(),
      completed_at: new Date().toISOString(),
      status: "failed",
      error_message: classified.message,
      error_type: classified.type,
      attempt_count: job.attempt_count,
      duration_ms: Date.now() - started,
      request_summary: { simulated },
    });

    await markRetryOrFail(admin, job, classified);
    await observe({
      organisationId: job.organisation_id,
      platform: job.platform,
      jobId: job.id,
      contentId: job.content_id,
      attempt: job.attempt_count,
      result: "failed",
      errorType: classified.type,
      durationMs: Date.now() - started,
    });
    return { error: classified.message, errorType: classified.type };
  }

  const publishedAt = new Date().toISOString();
  // If this fails the post is still recorded on content_platforms
  // (external_post_id), which the duplicate guard checks before any re-post.
  await updateLockedJob(admin, job, {
    status: result.status === "published" ? "published" : "processing",
    published_at: result.status === "published" ? publishedAt : null,
    external_post_id: result.externalPostId || null,
    external_url: result.externalUrl || null,
    error_message: null,
    error_type: null,
    locked_at: null,
    lock_token: null,
    simulated,
  });

  await logAutomationActivity(admin, {
    organisationId: job.organisation_id,
    eventType: "published",
    message: humanPublishMessage({
      platform: job.platform,
      success: true,
      simulated,
    }),
    severity: "success",
    metadata: {
      job_id: job.id,
      external_post_id: result.externalPostId,
      simulated,
    },
  });

  await observe({
    organisationId: job.organisation_id,
    platform: job.platform,
    jobId: job.id,
    contentId: job.content_id,
    attempt: job.attempt_count,
    result: result.status || "published",
    durationMs: Date.now() - started,
  });

  return {
    success: true,
    status: result.status,
    externalPostId: result.externalPostId,
    externalUrl: result.externalUrl,
    simulated,
  };
}

async function tryVerifyExistingPublish(
  admin: Admin,
  socialAccountId: string,
  organisationId: string,
  platform: SocialPlatform,
  contentPlatformId: string
) {
  const { data: cp } = await admin
    .from("content_platforms")
    .select("external_post_id")
    .eq("id", contentPlatformId)
    .maybeSingle();
  if (!cp?.external_post_id) return null;

  const token = await loadAccountSecrets(socialAccountId, organisationId);
  if (!token) return null;
  const adapter = getSocialAdapter(platform);
  if (!adapter.getPublishStatus) {
    return {
      externalPostId: cp.external_post_id,
      externalUrl: null as string | null,
    };
  }
  try {
    const status = await adapter.getPublishStatus(token, cp.external_post_id);
    if (status.status === "published") {
      return {
        externalPostId: status.externalPostId || cp.external_post_id,
        externalUrl: null as string | null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Cron entry: claim and process due + retryable jobs.
 */
export async function processDuePublishJobsReliable(limit = 15) {
  const admin = createAdminClient();

  const recovered = await recoverAbandonedLocks(admin);
  // After recovery, so jobs it just released for a safe retry are due now.
  const now = new Date().toISOString();

  const { data: duePending } = await admin
    .from("social_publish_jobs")
    .select("id, organisation_id, scheduled_at, platform, status")
    .in("status", ["pending", "ready"])
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  const { data: dueRetry } = await admin
    .from("social_publish_jobs")
    .select("id, organisation_id, scheduled_at, platform, status")
    .eq("status", "retrying")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  const candidates = [...(duePending || []), ...(dueRetry || [])].slice(
    0,
    limit
  );

  const results: Array<Record<string, unknown>> = [];

  for (const row of candidates) {
    const missed = await applyMissedSchedulePolicy(admin, row);
    if (missed !== "proceed") {
      results.push({ jobId: row.id, missed });
      continue;
    }

    // Re-claim from pending/ready/retrying
    // After missed policy reschedule, status may have changed
    const { data: fresh } = await admin
      .from("social_publish_jobs")
      .select("id, status")
      .eq("id", row.id)
      .maybeSingle();
    if (!fresh || !["pending", "ready", "retrying"].includes(fresh.status)) {
      continue;
    }

    const claimed = await claimPublishJob(admin, row.id, newLockToken());
    if (!claimed) {
      results.push({ jobId: row.id, skipped: "lock_lost" });
      continue;
    }

    try {
      const outcome = await processClaimedPublishJob(admin, claimed);
      results.push({ jobId: row.id, ...outcome });
    } catch (e) {
      const classified = classifyPublishError(e);
      await markRetryOrFail(admin, claimed, classified);
      results.push({ jobId: row.id, error: classified.message });
    }
  }

  await pollProcessingPublishesReliable(admin);

  return {
    processed: results.length,
    results,
    recoveredLocks: recovered,
    simulated: isPublishingSimulationEnabled(),
  };
}

/**
 * Recover processing jobs whose worker died (lock older than LOCK_TTL_MS):
 * - external_post_id known → stay processing; the poll verifies it.
 * - request_sent_at set → the provider may have accepted the post: move to
 *   `uncertain` and hold for a person to check. NEVER retried automatically.
 * - request never sent → safe to retry.
 * Each transition matches the stale lock token, so a live worker that still
 * holds the lock is never disturbed.
 */
export async function recoverAbandonedLocks(admin: Admin) {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data: stale } = await admin
    .from("social_publish_jobs")
    .select(
      "id, organisation_id, platform, external_post_id, locked_at, lock_token, attempt_count, request_sent_at, content_platform_id"
    )
    .eq("status", "processing")
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .limit(50);

  let recovered = 0;
  for (const job of stale || []) {
    if (job.external_post_id) {
      // Keep processing — pollProcessingPublishesReliable will verify
      continue;
    }

    if (job.request_sent_at) {
      const message =
        "The publishing worker stopped after sending this post to the platform, so it may already be live. Check the account before retrying.";
      const ok = await markUncertain(admin, job, message, {
        request_sent_at: job.request_sent_at,
      });
      if (!ok) continue;
      recovered += 1;
      continue;
    }

    const ok = await updateLockedJob(admin, job, {
      status: "retrying",
      next_retry_at: new Date().toISOString(),
      locked_at: null,
      lock_token: null,
      error_type: "NETWORK_ERROR",
      error_code: "ABANDONED_LOCK",
      error_message:
        "Previous publish attempt stopped before contacting the platform. Safe retry scheduled.",
    });
    if (!ok) continue;

    await logAutomationActivity(admin, {
      organisationId: job.organisation_id,
      eventType: "publish_retry",
      message: humanPublishMessage({
        platform: job.platform,
        errorType: "NETWORK_ERROR",
        message: "Recovered abandoned publish lock — retrying safely.",
      }),
      severity: "warning",
      metadata: { job_id: job.id, recovered_lock: true },
    });
    recovered += 1;
  }
  return recovered;
}

async function pollProcessingPublishesReliable(admin: Admin) {
  const { data: rows } = await admin
    .from("social_publish_jobs")
    .select(
      "id, organisation_id, content_id, content_platform_id, social_account_id, platform, external_post_id"
    )
    .eq("status", "processing")
    .not("external_post_id", "is", null)
    // Only rows no worker holds (the success write clears the lock).
    .is("lock_token", null)
    .limit(20);

  for (const row of rows || []) {
    if (!row.external_post_id) continue;
    const token = await loadAccountSecrets(
      row.social_account_id,
      row.organisation_id
    );
    if (!token) continue;
    const adapter = getSocialAdapter(row.platform as SocialPlatform);
    if (!adapter.getPublishStatus) continue;

    try {
      const status = await adapter.getPublishStatus(
        token,
        row.external_post_id
      );
      if (status.status === "published") {
        const publishedAt = new Date().toISOString();
        const ok = await updateLockedJob(
          admin,
          { id: row.id, lock_token: null },
          { status: "published", published_at: publishedAt, error_message: null }
        );
        if (!ok) continue;
        if (row.content_platform_id) {
          await admin
            .from("content_platforms")
            .update({
              publish_status: "published",
              published_at: publishedAt,
              error_message: null,
            })
            .eq("id", row.content_platform_id);
        }
        await admin
          .from("content")
          .update({ status: "published", published_at: publishedAt })
          .eq("id", row.content_id)
          .eq("organisation_id", row.organisation_id);

        await logAutomationActivity(admin, {
          organisationId: row.organisation_id,
          eventType: "publish_verified",
          message: `${row.platform.charAt(0).toUpperCase()}${row.platform.slice(1)} post verified.`,
          severity: "success",
          metadata: {
            job_id: row.id,
            external_post_id: row.external_post_id,
            verified: true,
          },
        });
      } else if (status.status === "failed") {
        await markRetryOrFail(
          admin,
          {
            id: row.id,
            organisation_id: row.organisation_id,
            content_id: row.content_id,
            platform: row.platform,
            attempt_count: 4,
            max_attempts: 4,
            social_account_id: row.social_account_id,
            lock_token: null,
          },
          {
            type: "PLATFORM_ERROR",
            retryable: false,
            message: status.errorMessage || "Platform reported publish failure",
          }
        );
      }
    } catch {
      // leave processing
    }
  }
}

export { buildIdempotencyKey, hashContentVersion };
