"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteAccountSecrets,
  loadAccountSecrets,
  saveAccountSecrets,
} from "@/lib/social/secrets";
import { holdJobsForAccountChange } from "@/lib/social/account-switch";
import type { TokenBundle } from "@/lib/social/types";
import type { Json } from "@/lib/database.types";
import {
  deleteOrgMetaApp,
  getOrgMetaAppInfo,
  saveOrgMetaApp,
} from "@/lib/social/meta-app-credentials";
import { getSocialAdapter } from "@/lib/social/registry";
import { enqueuePublishJobsForContent } from "@/lib/social/scheduler";
import { contentStatusAllows } from "@/lib/social/publish-authz";
import type { SocialPlatform } from "@/lib/types";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

export async function disconnectSocialAccount(input: {
  organisationId: string;
  platform: SocialPlatform;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return { error: "Only owners and managers can disconnect accounts" };
  }

  const { data: account } = await auth.supabase
    .from("social_accounts")
    .select("id, platform, connection_status")
    .eq("organisation_id", input.organisationId)
    .eq("platform", input.platform)
    .maybeSingle();

  if (!account) return { error: "Account not found" };

  try {
    const token = await loadAccountSecrets(account.id, input.organisationId);
    if (token) {
      const adapter = getSocialAdapter(input.platform);
      await adapter.disconnect?.(token);
    }
  } catch {
    // Continue disconnecting locally even if remote revoke fails
  }

  await deleteAccountSecrets(account.id, input.organisationId);

  await auth.supabase
    .from("social_accounts")
    .update({
      connection_status: "not_connected",
      token_vault_ref: null,
      token_expires_at: null,
      disconnected_at: new Date().toISOString(),
      last_error: null,
      // Keep account_name/handle/history identifiers for display of past publishes
    })
    .eq("id", account.id)
    .eq("organisation_id", input.organisationId);

  // Cancel all active jobs for this account
  const admin = createAdminClient();
  await admin
    .from("social_publish_jobs")
    .update({
      status: "cancelled",
      error_message: "Account disconnected",
      error_type: "BLOCKED_ACCOUNT",
    })
    .eq("social_account_id", account.id)
    .eq("organisation_id", input.organisationId)
    .in("status", ["pending", "ready", "retrying", "processing", "held"]);

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "social.disconnected",
    entity_type: "social_accounts",
    entity_id: account.id,
    metadata: { platform: input.platform },
  });

  revalidatePath("/app/social");
  revalidatePath("/app");
  return { success: true };
}

export async function publishContentNow(input: {
  contentId: string;
  socialAccountId: string;
  contentPlatformId?: string | null;
  tiktokPrivacyLevel?: string | null;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  // Route manual publish through the same job pipeline (idempotency + locks)
  const { publishContentViaJobPipeline } = await import(
    "@/lib/social/scheduler"
  );
  const result = await publishContentViaJobPipeline({
    contentId: input.contentId,
    socialAccountId: input.socialAccountId,
    contentPlatformId: input.contentPlatformId,
    tiktokPrivacyLevel: input.tiktokPrivacyLevel,
    userId: auth.user.id,
  });

  revalidatePath("/app/content");
  revalidatePath(`/app/content/${input.contentId}`);
  revalidatePath("/app/calendar");
  revalidatePath("/app/social");
  revalidatePath("/app/automation");
  return result;
}

export async function retryFailedPublish(input: {
  contentId: string;
  socialAccountId: string;
  contentPlatformId?: string | null;
}) {
  return publishContentNow(input);
}

export async function scheduleContentPublishing(input: {
  contentId: string;
  organisationId: string;
  scheduledAt: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) return { error: "Invalid schedule time" };
  const scheduledAt = when.toISOString();

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return { error: "Only owners and managers can schedule publishing" };
  }

  const { data: content } = await auth.supabase
    .from("content")
    .select("id, organisation_id, status, scheduled_at")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!content) return { error: "Content not found" };
  if (!contentStatusAllows(content.status, "enqueue")) {
    return { error: "Approve this content before scheduling it" };
  }

  const { data: marked, error: markError } = await auth.supabase
    .from("content")
    .update({ status: "scheduled", scheduled_at: scheduledAt })
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .select("id");
  if (markError) return { error: markError.message };
  if (!marked?.length) return { error: "Content could not be scheduled" };

  const jobs = await enqueuePublishJobsForContent({
    organisationId: input.organisationId,
    contentId: input.contentId,
    scheduledAt,
    userId: auth.user.id,
  });

  if (jobs.error || !jobs.jobIds.length) {
    // Do not leave content looking scheduled when nothing was queued.
    if (!jobs.jobIds.length) {
      await auth.supabase
        .from("content")
        .update({ status: content.status, scheduled_at: content.scheduled_at })
        .eq("id", input.contentId)
        .eq("organisation_id", input.organisationId);
    }
    return {
      error:
        jobs.error ||
        "No connected social accounts match this content’s platforms. Connect accounts first.",
    };
  }

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "content.scheduled_publish",
    entity_type: "content",
    entity_id: input.contentId,
    metadata: { job_count: jobs.jobIds.length, scheduled_at: scheduledAt },
  });

  revalidatePath("/app/content");
  revalidatePath("/app/calendar");
  return { success: true, jobIds: jobs.jobIds };
}

export async function updateAutopilotMode(input: {
  organisationId: string;
  mode: "manual" | "approval_required" | "autopilot";
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return { error: "Only owners and managers can change publishing mode" };
  }

  // Autopilot is refused server-side for now (also enforced by a DB trigger).
  if (input.mode === "autopilot") {
    return { error: "Autopilot is not available yet. Use Approval mode." };
  }
  if (input.mode !== "manual" && input.mode !== "approval_required") {
    return { error: "Invalid publishing mode" };
  }

  const { data: updatedOrg, error } = await auth.supabase
    .from("organisations")
    .update({ autopilot_mode: input.mode })
    .eq("id", input.organisationId)
    .select("id");

  if (error) return { error: error.message };
  if (!updatedOrg?.length) return { error: "Publishing mode was not changed" };

  const automationMode =
    input.mode === "approval_required" ? "approval" : "manual";

  // Keep the existing paused state / run state: changing the publishing mode
  // must not silently resume a paused business.
  const { data: existingSettings, error: readError } = await auth.supabase
    .from("automation_settings")
    .select("organisation_id")
    .eq("organisation_id", input.organisationId)
    .maybeSingle();
  if (readError) return { error: readError.message };

  const { error: settingsError } = existingSettings
    ? await auth.supabase
        .from("automation_settings")
        .update({ mode: automationMode, enabled: true })
        .eq("organisation_id", input.organisationId)
    : await auth.supabase.from("automation_settings").insert({
        organisation_id: input.organisationId,
        mode: automationMode,
        enabled: true,
        paused: false,
        current_state: "completed",
      });
  if (settingsError) return { error: settingsError.message };

  revalidatePath("/app/settings");
  revalidatePath("/app/social");
  revalidatePath("/app/automation");
  revalidatePath("/app");
  return { success: true };
}

type AccountSnapshot = {
  id: string;
  external_account_id: string | null;
  account_name: string | null;
  account_handle: string | null;
  profile_image_url: string | null;
  metadata: unknown;
};

/**
 * Point a Facebook/Instagram connection at a different Page / IG account.
 *
 * Order matters and every write is checked:
 *   1. audit the intended switch (old + new external ids)
 *   2. if the external id changes, hold queued jobs (re-approval) and flag
 *      in-flight ones — abort if that fails
 *   3. update the social_accounts row — abort if it fails
 *   4. only then store the new page token; if that fails, restore the row
 */
async function applyMetaAccountSwitch(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  organisationId: string;
  platform: "facebook" | "instagram";
  account: AccountSnapshot;
  token: TokenBundle;
  next: {
    external_account_id: string;
    account_name: string | null;
    account_handle: string | null;
    profile_image_url: string | null;
    metadata: Record<string, unknown>;
  };
}): Promise<
  | { success: true; heldJobs: number; otherPlatformJobs: number }
  | { error: string }
> {
  const admin = createAdminClient();
  const oldExternalId = input.account.external_account_id;
  const changed = oldExternalId !== input.next.external_account_id;

  const { error: auditError } = await admin.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: input.userId,
    action: changed ? "social.account_switched" : "social.account_refreshed",
    entity_type: "social_accounts",
    entity_id: input.account.id,
    metadata: {
      platform: input.platform,
      old_external_account_id: oldExternalId,
      new_external_account_id: input.next.external_account_id,
    },
  });
  if (auditError) {
    return { error: "Could not record the account change. Nothing was changed." };
  }

  let heldJobs = 0;
  let otherPlatformJobs = 0;
  if (changed) {
    try {
      const held = await holdJobsForAccountChange(admin, {
        organisationId: input.organisationId,
        socialAccountId: input.account.id,
        oldExternalId,
        newExternalId: input.next.external_account_id,
      });
      heldJobs = held.heldJobIds.length;
      otherPlatformJobs = held.otherPlatformJobIds.length;
    } catch (e) {
      return {
        error: `Could not pause queued posts, so the account was not switched. ${
          e instanceof Error ? e.message : ""
        }`.trim(),
      };
    }
  }

  const { data: updated, error: updateError } = await input.supabase
    .from("social_accounts")
    .update({
      external_account_id: input.next.external_account_id,
      account_name: input.next.account_name,
      account_handle: input.next.account_handle,
      profile_image_url: input.next.profile_image_url,
      metadata: input.next.metadata as Json,
    })
    .eq("id", input.account.id)
    .eq("organisation_id", input.organisationId)
    .select("id");
  if (updateError || !updated?.length) {
    return {
      error:
        "Could not switch the account. Queued posts for it were paused for re-approval.",
    };
  }

  try {
    await saveAccountSecrets({
      socialAccountId: input.account.id,
      organisationId: input.organisationId,
      token: input.token,
    });
  } catch {
    // Restore the previous identity so row and stored token stay paired.
    const { data: restored, error: restoreError } = await input.supabase
      .from("social_accounts")
      .update({
        external_account_id: oldExternalId,
        account_name: input.account.account_name,
        account_handle: input.account.account_handle,
        profile_image_url: input.account.profile_image_url,
        metadata: (input.account.metadata ?? {}) as Json,
      })
      .eq("id", input.account.id)
      .eq("organisation_id", input.organisationId)
      .select("id");
    const restoreFailed = Boolean(restoreError) || !restored?.length;
    if (restoreFailed) {
      // Row now names the new account but the vault holds the old token:
      // make the connection unusable until it is reconnected.
      const { error: markError } = await admin
        .from("social_accounts")
        .update({
          connection_status: "error",
          last_error: "Account switch failed part-way. Reconnect this account.",
        })
        .eq("id", input.account.id)
        .eq("organisation_id", input.organisationId);
      if (markError) {
        console.error(
          JSON.stringify({ scope: "social", account_id: input.account.id, mark_error_failed: markError.message })
        );
      }
    }
    await admin.from("audit_logs").insert({
      organisation_id: input.organisationId,
      user_id: input.userId,
      action: "social.account_switch_failed",
      entity_type: "social_accounts",
      entity_id: input.account.id,
      metadata: {
        platform: input.platform,
        old_external_account_id: oldExternalId,
        new_external_account_id: input.next.external_account_id,
        reason: "token_store_failed",
        restore_failed: restoreFailed,
      },
    });
    return {
      error: restoreFailed
        ? "Could not store the new account credentials, and the previous account could not be restored. Reconnect this account. Queued posts were paused for re-approval."
        : "Could not store the new account credentials. The previous account was kept; queued posts were paused for re-approval.",
    };
  }

  return { success: true, heldJobs, otherPlatformJobs };
}

export async function selectFacebookPage(input: {
  organisationId: string;
  pageId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return { error: "Only owners and managers can change the Facebook Page" };
  }

  const { data: account } = await auth.supabase
    .from("social_accounts")
    .select(
      "id, metadata, connection_status, external_account_id, account_name, account_handle, profile_image_url"
    )
    .eq("organisation_id", input.organisationId)
    .eq("platform", "facebook")
    .maybeSingle();

  if (!account || account.connection_status !== "connected") {
    return { error: "Connect Facebook first" };
  }

  const metadata = (account.metadata || {}) as {
    available_pages?: Array<{ id: string; name: string }>;
    page_id?: string;
  };
  const page = (metadata.available_pages || []).find(
    (p) => p.id === input.pageId
  );
  if (!page) {
    return { error: "That Page is not available for this connection. Reconnect Facebook." };
  }

  // Re-fetch page token requires stored user token — store selected page id;
  // publish uses pageAccessToken from vault. User must reconnect if switching pages
  // until we store all page tokens. For now update display + require reconnect for token swap.
  const token = await loadAccountSecrets(account.id, input.organisationId);
  if (!token?.accessToken) {
    return { error: "Missing credentials. Reconnect Facebook." };
  }

  try {
    const { metaFetch } = await import("@/lib/social/meta-client");
    const pages = await metaFetch<{
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        picture?: { data?: { url?: string } };
      }>;
    }>("/me/accounts", {
      searchParams: {
        access_token: token.accessToken,
        fields: "id,name,access_token,picture{url}",
      },
    });
    const full = pages.data?.find((p) => p.id === input.pageId);
    if (!full) {
      return { error: "Could not load that Page. Reconnect Facebook." };
    }

    const switched = await applyMetaAccountSwitch({
      supabase: auth.supabase,
      userId: auth.user.id,
      organisationId: input.organisationId,
      platform: "facebook",
      account,
      token: { ...token, pageAccessToken: full.access_token },
      next: {
        external_account_id: full.id,
        account_name: full.name,
        account_handle: full.name,
        profile_image_url: full.picture?.data?.url ?? null,
        metadata: { ...metadata, page_id: full.id },
      },
    });
    if ("error" in switched) return switched;

    revalidatePath("/app/social");
    revalidatePath("/app/automation");
    return {
      success: true,
      heldJobs: switched.heldJobs,
      otherPlatformJobs: switched.otherPlatformJobs,
    };
  } catch {
    return {
      error: "Could not switch Facebook Page. Try reconnecting.",
    };
  }
}

export async function selectInstagramPage(input: {
  organisationId: string;
  pageId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return {
      error: "Only owners and managers can change the Instagram account",
    };
  }

  const { data: account } = await auth.supabase
    .from("social_accounts")
    .select(
      "id, metadata, connection_status, external_account_id, account_name, account_handle, profile_image_url"
    )
    .eq("organisation_id", input.organisationId)
    .eq("platform", "instagram")
    .maybeSingle();

  if (!account || account.connection_status !== "connected") {
    return { error: "Connect Instagram first" };
  }

  const metadata = (account.metadata || {}) as {
    available_pages?: Array<{
      id: string;
      name: string;
      ig_user_id?: string;
    }>;
    page_id?: string;
    ig_user_id?: string;
    username?: string | null;
  };
  const page = (metadata.available_pages || []).find(
    (p) => p.id === input.pageId
  );
  if (!page?.ig_user_id) {
    return {
      error:
        "That Instagram account is not available for this connection. Reconnect Instagram.",
    };
  }

  const token = await loadAccountSecrets(account.id, input.organisationId);
  if (!token?.accessToken) {
    return { error: "Missing credentials. Reconnect Instagram." };
  }

  try {
    const { metaFetch } = await import("@/lib/social/meta-client");
    const pages = await metaFetch<{
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    }>("/me/accounts", {
      searchParams: {
        access_token: token.accessToken,
        fields: "id,name,access_token,instagram_business_account",
      },
    });
    const full = pages.data?.find((p) => p.id === input.pageId);
    const igUserId = full?.instagram_business_account?.id;
    if (!full || !igUserId) {
      return {
        error: "Could not load that Instagram account. Reconnect Instagram.",
      };
    }

    const igProfile = await metaFetch<{
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>(`/${igUserId}`, {
      searchParams: {
        access_token: full.access_token,
        fields: "id,username,name,profile_picture_url",
      },
    });

    const switched = await applyMetaAccountSwitch({
      supabase: auth.supabase,
      userId: auth.user.id,
      organisationId: input.organisationId,
      platform: "instagram",
      account,
      token: { ...token, pageAccessToken: full.access_token },
      next: {
        external_account_id: igUserId,
        account_name: igProfile.name || full.name,
        account_handle: igProfile.username
          ? `@${igProfile.username}`
          : igProfile.name || full.name,
        profile_image_url: igProfile.profile_picture_url ?? null,
        metadata: {
          ...metadata,
          page_id: full.id,
          ig_user_id: igUserId,
          username: igProfile.username || null,
        },
      },
    });
    if ("error" in switched) return switched;

    revalidatePath("/app/social");
    revalidatePath("/app/automation");
    return {
      success: true,
      heldJobs: switched.heldJobs,
      otherPlatformJobs: switched.otherPlatformJobs,
    };
  } catch {
    return {
      error: "Could not switch Instagram account. Try reconnecting.",
    };
  }
}

async function requireOwnerOrManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  userId: string
) {
  const { data: membership } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(membership && ["owner", "manager"].includes(membership.role));
}

export async function saveOrgMetaAppCredentials(input: {
  organisationId: string;
  appId: string;
  appSecret: string;
  label?: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  if (!(await requireOwnerOrManager(auth.supabase, input.organisationId, auth.user.id))) {
    return { error: "Only owners and managers can change the Meta app" };
  }

  const appId = input.appId.trim();
  const appSecret = input.appSecret.trim();
  if (!/^\d{5,}$/.test(appId)) {
    return { error: "Enter a valid Meta App ID (numeric)." };
  }
  if (appSecret.length < 16) {
    return { error: "Enter the Meta App Secret from your app's Basic settings." };
  }

  let previousAppId: string | null = null;
  try {
    previousAppId = (await getOrgMetaAppInfo(input.organisationId)).appId;
  } catch {
    return { error: "Could not read the current Meta app settings." };
  }

  try {
    await saveOrgMetaApp({
      organisationId: input.organisationId,
      appId,
      appSecret,
      label: input.label?.trim() || null,
    });
  } catch {
    return { error: "Could not save the Meta app credentials." };
  }

  // Never log the secret — only which app id was set.
  await writeMetaAppAudit({
    organisationId: input.organisationId,
    userId: auth.user.id,
    action: "social.meta_app_saved",
    metadata: { app_id: appId, previous_app_id: previousAppId },
  });
  revalidatePath("/app/social");
  return { success: true };
}

async function writeMetaAppAudit(input: {
  organisationId: string;
  userId: string;
  action: string;
  metadata: Record<string, string | null>;
}) {
  const { error } = await createAdminClient().from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: input.userId,
    action: input.action,
    entity_type: "organisation_meta_apps",
    entity_id: input.organisationId,
    metadata: input.metadata,
  });
  if (error) {
    console.error(
      JSON.stringify({ scope: "audit", action: input.action, failed: error.message })
    );
  }
}

export async function removeOrgMetaAppCredentials(input: {
  organisationId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  if (!(await requireOwnerOrManager(auth.supabase, input.organisationId, auth.user.id))) {
    return { error: "Only owners and managers can change the Meta app" };
  }

  let previousAppId: string | null = null;
  try {
    previousAppId = (await getOrgMetaAppInfo(input.organisationId)).appId;
    await deleteOrgMetaApp(input.organisationId);
  } catch {
    return { error: "Could not remove the Meta app credentials." };
  }

  await writeMetaAppAudit({
    organisationId: input.organisationId,
    userId: auth.user.id,
    action: "social.meta_app_removed",
    metadata: { previous_app_id: previousAppId },
  });
  revalidatePath("/app/social");
  return { success: true };
}
