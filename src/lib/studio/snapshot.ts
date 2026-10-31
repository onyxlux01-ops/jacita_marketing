import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { normaliseTimeZone } from "@/lib/timezone";
import type { ContentStatus } from "@/lib/types";
import type { StudioSnapshot } from "./types";

const STATUSES: ContentStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
];

/**
 * Read-only data adapter for the Marketing Studio. Every query is scoped to the
 * one business passed in (on top of RLS), so a studio can never mix records
 * from two businesses. Nothing here writes.
 */
export async function getStudioSnapshot(
  db: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
): Promise<StudioSnapshot> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000);
  const twoDaysAgo = new Date(now - 2 * 86_400_000).toISOString().slice(0, 10);
  const [org, counts, recent, tasks, nextScheduled, held, confirmed, brand, media, campaigns, accounts, metrics] =
    await Promise.all([
      db
        .from("organisations")
        .select("name, timezone")
        .eq("id", organisationId)
        .single(),
      Promise.all(
        STATUSES.map(async (status) => {
          const result = await db
            .from("content")
            .select("id", { count: "exact", head: true })
            .eq("organisation_id", organisationId)
            .eq("status", status);
          if (result.error) throw new Error("Content totals could not be loaded.");
          return [status, result.count ?? 0] as const;
        }),
      ),
      db
        .from("content")
        .select("id, title, status, updated_at, scheduled_at")
        .eq("organisation_id", organisationId)
        .order("updated_at", { ascending: false })
        .limit(40),
      db
        .from("automation_tasks")
        .select("id, task_type, status, created_at")
        .eq("organisation_id", organisationId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(12),
      db
        .from("content")
        .select("scheduled_at")
        .eq("organisation_id", organisationId)
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(1),
      db
        .from("social_publish_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", organisationId)
        .eq("status", "held"),
      db
        .from("social_publish_jobs")
        .select("id, content_id, platform, published_at")
        .eq("organisation_id", organisationId)
        .eq("status", "published")
        .eq("simulated", false)
        .not("external_post_id", "is", null)
        .gte("published_at", weekAgo.toISOString())
        .order("published_at", { ascending: false })
        .limit(10),
      db
        .from("brand_profiles")
        .select("logo_path")
        .eq("organisation_id", organisationId)
        .maybeSingle(),
      db
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", organisationId)
        .eq("is_active", true),
      db
        .from("campaigns")
        .select("name")
        .eq("organisation_id", organisationId)
        .eq("status", "active")
        .order("start_date", { ascending: true })
        .limit(5),
      db
        .from("social_accounts")
        .select("connection_status, health_status")
        .eq("organisation_id", organisationId),
      db
        .from("analytics_metrics")
        .select("metric_date, reach, enquiries, updated_at")
        .eq("organisation_id", organisationId)
        .gte("metric_date", weekAgo.toISOString().slice(0, 10))
        .order("metric_date", { ascending: false })
        .limit(500),
    ]);
  if (org.error || recent.error)
    throw new Error("Studio records could not be loaded.");
  // Secondary sources degrade to "unknown" rather than failing the whole studio,
  // but they never fall back to invented values.
  const rows = metrics.data ?? [];
  const accountRows = accounts.data ?? [];
  return {
    organisationId,
    businessName: org.data.name,
    fetchedAt: new Date(now).toISOString(),
    demo: false,
    timezone: normaliseTimeZone(org.data.timezone),
    counts: Object.fromEntries(counts) as Record<ContentStatus, number>,
    content: (recent.data ?? []).map((c) => ({
      id: c.id,
      title: c.title || "Untitled content",
      status: c.status as ContentStatus,
      updatedAt: c.updated_at,
      scheduledAt: c.scheduled_at,
    })),
    tasks: (tasks.data ?? []).map((t) => ({
      id: t.id,
      type: t.task_type,
      status: t.status === "running" ? "running" : "pending",
      createdAt: t.created_at,
    })),
    publishing: {
      scheduled: Object.fromEntries(counts).scheduled ?? 0,
      nextScheduledAt: nextScheduled.data?.[0]?.scheduled_at ?? null,
      held: held.error ? 0 : (held.count ?? 0),
      confirmed: (confirmed.data ?? [])
        .filter((p) => p.published_at)
        .map((p) => ({
          id: p.id,
          contentId: p.content_id,
          platform: p.platform,
          publishedAt: p.published_at as string,
        })),
    },
    setup: {
      hasLogo: Boolean(brand.data?.logo_path),
      mediaCount: media.count ?? 0,
      activeCampaigns: (campaigns.data ?? []).map((c) => c.name),
      connectionIssues: accountRows.filter(
        (a) =>
          a.connection_status !== "connected" ||
          ["attention", "reauth_required"].includes(a.health_status ?? ""),
      ).length,
      accounts: accountRows.length,
    },
    analytics: {
      enquiries7d: rows.reduce((sum, r) => sum + (r.enquiries ?? 0), 0),
      enquiries2d: rows
        .filter((r) => r.metric_date >= twoDaysAgo)
        .reduce((sum, r) => sum + (r.enquiries ?? 0), 0),
      reach7d: rows.reduce((sum, r) => sum + (r.reach ?? 0), 0),
      lastMetricDate: rows[0]?.metric_date ?? null,
      lastUpdatedAt: rows.reduce<string | null>(
        (best, r) => (!best || r.updated_at > best ? r.updated_at : best),
        null,
      ),
    },
  };
}
