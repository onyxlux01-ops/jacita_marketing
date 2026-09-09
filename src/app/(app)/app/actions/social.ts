"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccountSecrets, loadAccountSecrets } from "@/lib/social/secrets";
import { getSocialAdapter } from "@/lib/social/registry";
import { enqueuePublishJobsForContent } from "@/lib/social/scheduler";
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
    .in("status", ["pending", "ready", "retrying", "processing"]);

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

  const { data: content } = await auth.supabase
    .from("content")
    .select("id, organisation_id, status")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!content) return { error: "Content not found" };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) return { error: "Unauthorized" };

  await auth.supabase
    .from("content")
    .update({
      status: "scheduled",
      scheduled_at: input.scheduledAt,
    })
    .eq("id", input.contentId);

  const jobs = await enqueuePublishJobsForContent({
    organisationId: input.organisationId,
    contentId: input.contentId,
    scheduledAt: input.scheduledAt,
    userId: auth.user.id,
  });

  if (!jobs.jobIds.length) {
    return {
      error:
        "No connected social accounts match this content’s platforms. Connect accounts first.",
    };
  }

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "content.scheduled_publish",
    entity_type: "content",
    entity_id: input.contentId,
    metadata: { job_count: jobs.jobIds.length, scheduled_at: input.scheduledAt },
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

  if (!membership || membership.role !== "owner") {
    return { error: "Only owners can change publishing mode" };
  }

  const { error } = await auth.supabase
    .from("organisations")
    .update({ autopilot_mode: input.mode })
    .eq("id", input.organisationId);

  if (error) return { error: error.message };

  const automationMode =
    input.mode === "autopilot"
      ? "autopilot"
      : input.mode === "approval_required"
        ? "approval"
        : "manual";

  await auth.supabase.from("automation_settings").upsert({
    organisation_id: input.organisationId,
    mode: automationMode,
    enabled: true,
    paused: false,
    current_state: "completed",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/social");
  revalidatePath("/app/automation");
  revalidatePath("/app");
  return { success: true };
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
    .select("id, metadata, connection_status")
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

    const { saveAccountSecrets } = await import("@/lib/social/secrets");
    await saveAccountSecrets({
      socialAccountId: account.id,
      organisationId: input.organisationId,
      token: {
        ...token,
        pageAccessToken: full.access_token,
      },
    });

    await auth.supabase
      .from("social_accounts")
      .update({
        external_account_id: full.id,
        account_name: full.name,
        account_handle: full.name,
        profile_image_url: full.picture?.data?.url ?? null,
        metadata: {
          ...metadata,
          page_id: full.id,
        },
      })
      .eq("id", account.id)
      .eq("organisation_id", input.organisationId);

    revalidatePath("/app/social");
    return { success: true };
  } catch {
    return {
      error: "Could not switch Facebook Page. Try reconnecting.",
    };
  }
}
