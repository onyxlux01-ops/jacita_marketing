import "server-only";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import { fromZonedInputValue, normaliseTimeZone } from "@/lib/timezone";
import type { ContentStatus } from "@/lib/types";

export type ReviewItem = {
  id: string;
  title: string;
  reason: string;
  action: string;
  href: string;
  urgent?: boolean;
};
export type Metric = Pick<
  Tables<"analytics_metrics">,
  | "id"
  | "platform"
  | "metric_date"
  | "reach"
  | "video_views"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "enquiries"
  | "bookings"
  | "source"
  | "updated_at"
  | "campaign_id"
>;

// Read through the authenticated client. Every query carries the selected business
// scope as well as the database's membership/RLS boundary. No admin client needed.
export async function getOverview(
  db: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  days: number,
) {
  const org = await db
    .from("organisations")
    .select("timezone")
    .eq("id", organisationId)
    .single();
  if (org.error) throw new Error("Business details could not be loaded.");
  const timezone = normaliseTimeZone(org.data.timezone);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const previousStart = new Date(start);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const nextDay = new Date(end.getTime() + 86400000).toISOString().slice(0, 10);
  const startInstant = fromZonedInputValue(`${from}T00:00`, timezone);
  const endInstant = fromZonedInputValue(`${nextDay}T00:00`, timezone);
  if (!startInstant.ok || !endInstant.ok)
    throw new Error("Reporting period could not be resolved.");
  const statuses: ContentStatus[] = [
    "draft",
    "review",
    "approved",
    "scheduled",
    "publishing",
    "published",
    "failed",
  ];
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const result = await db
        .from("content")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", organisationId)
        .eq("status", status);
      if (result.error) throw new Error("Content totals could not be loaded.");
      return [status, result.count ?? 0] as const;
    }),
  );
  const [
    review,
    accounts,
    brand,
    campaigns,
    settings,
    held,
    publications,
    activity,
    media,
    publishedContent,
  ] = await Promise.all([
    db
      .from("content")
      .select("id, title, status, updated_at")
      .eq("organisation_id", organisationId)
      .in("status", ["review", "failed"])
      .order("updated_at", { ascending: true })
      .limit(8),
    db
      .from("social_accounts")
      .select("id, platform, account_name, connection_status, health_status")
      .eq("organisation_id", organisationId),
    db
      .from("brand_profiles")
      .select("logo_path, brand_voice, tone")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    db
      .from("campaigns")
      .select("id, name, status, start_date, end_date")
      .eq("organisation_id", organisationId)
      .in("status", ["active", "draft"])
      .order("start_date", { ascending: true }),
    db
      .from("automation_settings")
      .select("enabled, mode, paused, state_message")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    db
      .from("social_publish_jobs")
      .select("id, content_id", { count: "exact" })
      .eq("organisation_id", organisationId)
      .eq("status", "held")
      .limit(5),
    db
      .from("social_publish_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "published")
      .eq("simulated", false)
      .not("external_post_id", "is", null)
      .gte("published_at", startInstant.iso)
      .lt("published_at", endInstant.iso),
    db
      .from("automation_activity")
      .select("id, message, severity, created_at")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(4),
    db
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("is_active", true),
    db
      .from("content")
      .select("id, social_publish_jobs!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("organisation_id", organisationId)
      .eq("status", "published")
      .eq("social_publish_jobs.organisation_id", organisationId)
      .eq("social_publish_jobs.status", "published")
      .eq("social_publish_jobs.simulated", false)
      .not("social_publish_jobs.external_post_id", "is", null),
  ]);
  for (const result of [
    review,
    accounts,
    brand,
    campaigns,
    settings,
    publications,
    activity,
    media,
    publishedContent,
  ]) {
    if (result.error)
      throw new Error(
        "Some workspace records could not be loaded. Please try again.",
      );
  }
  // Paginate instead of silently truncating metrics or spend at the API row cap.
  const metrics: Metric[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db
      .from("analytics_metrics")
      .select(
        "id, platform, metric_date, reach, video_views, likes, comments, shares, saves, enquiries, bookings, source, updated_at, campaign_id",
      )
      .eq("organisation_id", organisationId)
      .gte("metric_date", previousStart.toISOString().slice(0, 10))
      .lte("metric_date", to)
      .order("id")
      .range(offset, offset + 499);
    if (result.error)
      throw new Error("Performance records could not be loaded.");
    metrics.push(...result.data);
    if (result.data.length < 500) break;
  }
  const costs: Array<{
    actual_cost_pence: number | null;
    estimated_cost_pence: number;
  }> = [];
  let costsAvailable = true;
  for (let offset = 0; ; offset += 500) {
    const result = await db
      .from("ai_usage")
      .select("actual_cost_pence, estimated_cost_pence")
      .eq("organisation_id", organisationId)
      .gte("created_at", startInstant.iso)
      .lt("created_at", endInstant.iso)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) {
      costsAvailable = false;
      costs.length = 0;
      break;
    }
    costs.push(...result.data);
    if (result.data.length < 500) break;
  }
  const queue: ReviewItem[] = (review.data ?? []).map((item) => ({
    id: item.id,
    title: item.title || "Untitled content",
    href: `/app/content/${item.id}`,
    reason:
      item.status === "failed"
        ? "Publication failed"
        : `${Date.now() - new Date(item.updated_at).getTime() > 7 * 86400000 ? "Overdue · " : ""}Awaiting approval`,
    action: item.status === "failed" ? "Review failure" : "Review draft",
    urgent: item.status === "failed",
  }));
  const connectionIssues = (accounts.data ?? []).filter(
    (a) =>
      a.connection_status !== "connected" ||
      ["attention", "reauth_required"].includes(a.health_status ?? ""),
  );
  for (const account of connectionIssues)
    queue.push({
      id: account.id,
      title: account.account_name || account.platform,
      reason: `${account.platform} · ${account.connection_status === "connected" ? account.health_status : account.connection_status.replaceAll("_", " ")}`,
      action: "Fix connection",
      href: "/app/social",
      urgent: true,
    });
  if (!accounts.data?.length)
    queue.push({
      id: "connections",
      title: "Connect a publishing account",
      reason: "No social accounts connected",
      action: "Set up accounts",
      href: "/app/social",
    });
  if (!brand.data?.logo_path)
    queue.push({
      id: "brand",
      title: "Business brand assets",
      reason: "No brand logo uploaded",
      action: "Add assets",
      href: "/app/settings?section=brand",
    });
  if (!media.count)
    queue.push({
      id: "media",
      title: "Content media library",
      reason: "No active media available",
      action: "Upload media",
      href: "/app/media",
    });
  const expired =
    campaigns.data?.filter(
      (c) => c.status === "active" && c.end_date && c.end_date < today,
    ) ?? [];
  for (const campaign of expired)
    queue.push({
      id: campaign.id,
      title: campaign.name,
      reason: "Campaign end date has passed",
      action: "Review campaign",
      href: "/app/campaigns",
    });
  for (const job of held.data ?? [])
    queue.push({
      id: job.id,
      title: "Publishing hold",
      reason: "Publishing paused · inspect approval",
      action: "Review hold",
      href: `/app/content/${job.content_id}`,
      urgent: true,
    });
  const totals = Object.fromEntries(counts) as Record<ContentStatus, number>;
  return {
    timezone,
    from,
    to,
    days,
    totals,
    queue,
    holdsAvailable: !held.error,
    heldCount: held.error ? null : (held.count ?? 0),
    attentionCount:
      totals.review +
      totals.failed +
      connectionIssues.length +
      (accounts.data?.length ? 0 : 1) +
      (brand.data?.logo_path ? 0 : 1) +
      (media.count ? 0 : 1) +
      expired.length +
      (held.count ?? 0),
    publications: publications.count ?? 0,
    publishedContent: publishedContent.count ?? 0,
    metrics,
    accounts: accounts.data ?? [],
    campaigns: campaigns.data ?? [],
    settings: settings.data,
    activity: activity.data ?? [],
    costs: {
      available: costsAvailable,
      count: costs.length,
      calculated: costs.reduce((sum, c) => sum + (c.actual_cost_pence ?? 0), 0),
      estimated: costs
        .filter((c) => c.actual_cost_pence == null)
        .reduce((sum, c) => sum + c.estimated_cost_pence, 0),
      unsettled: costs.filter((c) => c.actual_cost_pence == null).length,
    },
  };
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;
