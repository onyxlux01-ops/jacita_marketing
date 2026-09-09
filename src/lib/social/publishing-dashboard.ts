import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getSocialAdapter } from "@/lib/social/registry";
import type { SocialPlatform } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Admin = ReturnType<typeof createAdminClient>;

export type AccountHealth = {
  platform: SocialPlatform;
  accountName: string | null;
  connectionStatus: string;
  health:
    | "connected"
    | "healthy"
    | "attention"
    | "reauth_required"
    | "disconnected"
    | "not_configured";
  label: string;
  detail: string | null;
};

export async function getSocialAccountHealth(
  supabase: Supabase | Admin,
  organisationId: string
): Promise<AccountHealth[]> {
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select(
      "platform, account_name, connection_status, health_status, last_error"
    )
    .eq("organisation_id", organisationId);

  const platforms: SocialPlatform[] = ["instagram", "facebook", "tiktok"];
  return platforms.map((platform) => {
    const row = (accounts || []).find((a) => a.platform === platform);
    const adapter = getSocialAdapter(platform);
    if (!adapter.isConfigured()) {
      return {
        platform,
        accountName: null,
        connectionStatus: "not_connected",
        health: "not_configured" as const,
        label:
          platform === "tiktok"
            ? "Requires configuration"
            : "Not configured",
        detail:
          platform === "tiktok"
            ? "TikTok publishing requires additional developer configuration."
            : "Add platform API credentials to enable publishing.",
      };
    }
    if (!row || row.connection_status === "not_connected") {
      return {
        platform,
        accountName: null,
        connectionStatus: "not_connected",
        health: "disconnected" as const,
        label: "Disconnected",
        detail: null,
      };
    }
    if (
      row.connection_status === "expired" ||
      row.health_status === "reauth_required"
    ) {
      return {
        platform,
        accountName: row.account_name,
        connectionStatus: row.connection_status,
        health: "reauth_required" as const,
        label: "Reauthorization required",
        detail: "Reconnect so publishing can continue.",
      };
    }
    if (
      row.connection_status === "error" ||
      row.health_status === "attention"
    ) {
      return {
        platform,
        accountName: row.account_name,
        connectionStatus: row.connection_status,
        health: "attention" as const,
        label: "Attention required",
        detail: row.last_error,
      };
    }
    return {
      platform,
      accountName: row.account_name,
      connectionStatus: row.connection_status,
      health: "healthy" as const,
      label: "Connected",
      detail: null,
    };
  });
}

export async function getPublishingDashboard(
  supabase: Supabase | Admin,
  organisationId: string
) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const [
    { count: publishedToday },
    { count: scheduled },
    { data: failed },
    { data: queue },
    { data: recentLogs },
    health,
  ] = await Promise.all([
    supabase
      .from("social_publish_jobs")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "published")
      .gte("published_at", startIso),
    supabase
      .from("social_publish_jobs")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .in("status", ["pending", "ready", "retrying"]),
    supabase
      .from("social_publish_jobs")
      .select("id, platform, error_message, error_type, content_id, status")
      .eq("organisation_id", organisationId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("social_publish_jobs")
      .select(
        "id, platform, status, scheduled_at, error_message, error_type, content_id"
      )
      .eq("organisation_id", organisationId)
      .in("status", [
        "pending",
        "ready",
        "processing",
        "retrying",
        "published",
        "failed",
      ])
      .order("scheduled_at", { ascending: true })
      .limit(20),
    supabase
      .from("social_publish_logs")
      .select(
        "id, platform, status, error_message, error_type, completed_at, created_at"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(8),
    getSocialAccountHealth(supabase, organisationId),
  ]);

  const contentIds = [
    ...new Set([
      ...(failed || []).map((f) => f.content_id),
      ...(queue || []).map((q) => q.content_id),
    ]),
  ].filter(Boolean) as string[];

  const titleById = new Map<string, string>();
  if (contentIds.length) {
    const { data: contents } = await supabase
      .from("content")
      .select("id, title, hook")
      .eq("organisation_id", organisationId)
      .in("id", contentIds);
    for (const c of contents || []) {
      titleById.set(c.id, c.title || c.hook || "Content");
    }
  }

  const needsAttention =
    (failed?.length || 0) +
    health.filter(
      (h) =>
        h.health === "reauth_required" ||
        h.health === "attention" ||
        h.health === "not_configured"
    ).length;

  return {
    today: {
      published: publishedToday ?? 0,
      scheduled: scheduled ?? 0,
      needsAttention,
    },
    failed: (failed || []).map((f) => ({
      id: f.id,
      platform: f.platform,
      contentId: f.content_id,
      title: titleById.get(f.content_id) || "Content",
      reason: f.error_message || f.error_type || "Publishing failed",
      errorType: f.error_type,
    })),
    queue: (queue || []).map((q) => ({
      id: q.id,
      platform: q.platform as SocialPlatform,
      status: q.status,
      scheduledAt: q.scheduled_at,
      title: titleById.get(q.content_id) || "Content",
      contentId: q.content_id,
      errorMessage: q.error_message,
      errorType: q.error_type,
    })),
    recentActivity: (recentLogs || []).map((l) => ({
      id: l.id,
      platform: l.platform as SocialPlatform,
      status: l.status,
      errorType: l.error_type,
      errorMessage: l.error_message,
      at: l.completed_at || l.created_at,
    })),
    health,
  };
}
