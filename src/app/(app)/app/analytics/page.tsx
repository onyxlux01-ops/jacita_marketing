import Link from "next/link";
import { Suspense } from "react";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  buildPerformanceSnapshot,
  formatPercentChange,
  type DateRangePreset,
} from "@/lib/analytics";
import { PlatformPill } from "@/components/content/platform-icons";
import { Button } from "@/components/ui/button";
import { AnalyticsActions } from "./analytics-actions";
import { AnalyticsRangeTabs } from "./range-tabs";
import type { SocialPlatform } from "@/lib/types";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const preset = (
    ["7d", "30d", "90d"].includes(rangeParam || "")
      ? rangeParam
      : "30d"
  ) as DateRangePreset;

  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  let snapshot = null as Awaited<
    ReturnType<typeof buildPerformanceSnapshot>
  >;
  let recommendations: Array<{
    id: string;
    title: string | null;
    insight_text: string;
    evidence: string | null;
    priority: string | null;
    confidence: string;
    action_label: string | null;
    action_href: string | null;
  }> = [];
  let weeklyReview: {
    what_happened: string;
    what_worked: string;
    what_didnt: string;
    what_we_learned: string;
    what_to_do_next: string;
    confidence: string;
  } | null = null;

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      snapshot = await buildPerformanceSnapshot(supabase, active.id, {
        preset,
      });
      const [{ data: recs }, { data: review }] = await Promise.all([
        supabase
          .from("ai_insights")
          .select(
            "id, title, insight_text, evidence, priority, confidence, action_label, action_href"
          )
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .eq("insight_type", "recommendation")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("marketing_weekly_reviews")
          .select(
            "what_happened, what_worked, what_didnt, what_we_learned, what_to_do_next, confidence"
          )
          .eq("organisation_id", active.id)
          .order("week_start", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      recommendations = recs ?? [];
      weeklyReview = review;
    } catch {
      snapshot = null;
    }
  }

  const source = snapshot?.current.source ?? "none";
  const health = snapshot?.health;
  const current = snapshot?.current;
  const changes = snapshot?.changes;

  const kpis = [
    {
      label: "Reach",
      value: current?.reach?.toLocaleString() ?? "—",
      change: formatPercentChange(changes?.reach ?? null),
    },
    {
      label: "Engagement",
      value:
        current?.engagement_rate != null
          ? `${current.engagement_rate}%`
          : "—",
      change: formatPercentChange(changes?.engagement_rate ?? null),
    },
    {
      label: "Audience growth",
      value:
        current?.net_followers != null
          ? `${current.net_followers >= 0 ? "+" : ""}${current.net_followers}`
          : "—",
      change: formatPercentChange(changes?.net_followers ?? null),
    },
    {
      label: "Bookings",
      value: current?.bookings?.toLocaleString() ?? "—",
      change: formatPercentChange(changes?.bookings ?? null),
    },
    {
      label: "Revenue attributed",
      value:
        current != null
          ? `£${current.revenue.toLocaleString()}`
          : "—",
      change: formatPercentChange(changes?.revenue ?? null),
    },
  ];

  const insightTitle =
    recommendations[0]?.title ||
    recommendations[0]?.insight_text ||
    weeklyReview?.what_worked ||
    "Connect channels or create content to start collecting performance signals.";
  const insightBody =
    recommendations[0]?.evidence ||
    weeklyReview?.what_happened ||
    "Stored and live metrics appear here once available for this business.";

  const series = snapshot
    ? snapshot.platforms
        .find((p) => p.platform === "instagram")
        ?.totals
    : null;

  // Simple reach bars from platform totals for visual continuity
  const maxReach = Math.max(
    ...(snapshot?.platforms.map((p) => p.totals.reach) || [1]),
    1
  );

  return (
    <div className="jacita-page jacita-enter">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="jacita-label">Intelligence</p>
          <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
            Analytics
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Performance for {active?.name ?? "your business"} ·{" "}
            <span className="capitalize">
              {source === "none"
                ? "no stored metrics yet"
                : `${source} data`}
            </span>
            {snapshot?.goalLabel ? ` · Goal: ${snapshot.goalLabel}` : ""}
          </p>
        </div>
        {active ? (
          <AnalyticsActions organisationId={active.id} />
        ) : null}
      </header>

      <Suspense fallback={<div className="mt-4 h-9 w-48 rounded-lg bg-muted/80" />}>
        <AnalyticsRangeTabs current={preset} />
      </Suspense>

      {snapshot?.dataQuality.notes.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {snapshot.dataQuality.notes.join(" ")}
        </p>
      ) : null}

      <section className="mt-6 border-y border-border/70 py-6">
        <p className="text-xs font-medium text-primary">AI insight</p>
        <p className="mt-3 max-w-3xl font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          {insightTitle}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {insightBody}
        </p>
      </section>

      {health && health.confidence !== "insufficient_data" ? (
        <section className="mt-6 border-b border-border/70 pb-6">
          <p className="jacita-label">Marketing health</p>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <p className="font-heading text-3xl font-semibold tracking-tight">
              {health.score}{" "}
              <span className="text-lg text-muted-foreground">/ 100</span>
            </p>
            {health.delta != null ? (
              <p className="text-sm text-muted-foreground">
                {health.delta >= 0 ? "↑" : "↓"} {Math.abs(health.delta)} points
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Main improvement: {health.mainImprovement ?? "—"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Main opportunity: {health.mainOpportunity ?? "—"}
          </p>
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border/70 pb-6 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 font-heading text-xl font-semibold tracking-tight sm:text-2xl">
              {kpi.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {kpi.change} vs prior
            </p>
          </div>
        ))}
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="font-heading text-lg font-semibold">
          Platform performance
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {(snapshot?.platforms || []).map((p) => (
            <li
              key={p.platform}
              className="rounded-xl border border-border/70 px-4 py-4"
            >
              <PlatformPill platform={p.platform as SocialPlatform} />
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">
                    {p.platform === "tiktok" ? "Views" : "Reach"}
                  </dt>
                  <dd className="font-medium">
                    {p.platform === "tiktok"
                      ? (p.totals.video_views ?? p.totals.reach).toLocaleString()
                      : p.totals.reach.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Engagement</dt>
                  <dd className="font-medium">
                    {p.totals.engagement_rate != null
                      ? `${p.totals.engagement_rate}%`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Followers</dt>
                  <dd className="font-medium">
                    {p.totals.net_followers != null
                      ? `${p.totals.net_followers >= 0 ? "+" : ""}${p.totals.net_followers}`
                      : "—"}
                  </dd>
                </div>
              </dl>
              {p.topContentTitle ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Top: {p.topContentTitle}
                </p>
              ) : null}
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.max(8, Math.round((p.totals.reach / maxReach) * 100))}%`,
                  }}
                />
              </div>
            </li>
          ))}
          {!snapshot?.platforms.length ? (
            <li className="text-sm text-muted-foreground">
              No platform metrics yet.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            What is working
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked for {snapshot?.goalLabel ?? "your current goal"}
          </p>
          <ul className="mt-4 space-y-3">
            {(snapshot?.rankings.bestContentType || []).slice(0, 4).map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="capitalize">{item.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  score {item.metricValue}
                </span>
              </li>
            ))}
            {!snapshot?.rankings.bestContentType.length ? (
              <li className="text-sm text-muted-foreground">
                Not enough content-linked data yet.
              </li>
            ) : null}
          </ul>
          {(snapshot?.rankings.bestDay || []).length > 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Best day:{" "}
              <span className="font-medium text-foreground">
                {snapshot!.rankings.bestDay[0].label}
              </span>
            </p>
          ) : null}
        </div>

        <div className="space-y-5">
          <div>
            <h2 className="font-heading text-lg font-semibold">Breakdown</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Where attention converts
            </p>
          </div>
          {[
            {
              label: "Impressions",
              value: current?.impressions?.toLocaleString() ?? "0",
              width: 88,
            },
            {
              label: "Link clicks",
              value: current?.link_clicks?.toLocaleString() ?? "0",
              width: current?.impressions
                ? Math.min(
                    100,
                    Math.round(
                      ((current.link_clicks || 0) /
                        Math.max(current.impressions, 1)) *
                        100
                    )
                  )
                : 8,
            },
            {
              label: "Bookings",
              value: current?.bookings?.toLocaleString() ?? "0",
              width: current?.link_clicks
                ? Math.min(
                    100,
                    Math.round(
                      ((current.bookings || 0) /
                        Math.max(current.link_clicks, 1)) *
                        100
                    )
                  )
                : 8,
            },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(row.width, 8)}%` }}
                />
              </div>
            </div>
          ))}
          {series ? null : null}
        </div>
      </section>

      {recommendations.length > 0 ? (
        <section className="mt-8 space-y-4">
          <h2 className="font-heading text-lg font-semibold">
            Recommendations
          </h2>
          <ul className="space-y-4">
            {recommendations.map((rec) => (
              <li
                key={rec.id}
                className="rounded-xl border border-border/70 px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {rec.priority || "medium"} priority
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {rec.confidence} confidence
                  </span>
                </div>
                <p className="mt-1 font-heading text-base font-semibold">
                  {rec.title || rec.insight_text}
                </p>
                {rec.evidence ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Evidence: {rec.evidence}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rec.insight_text}
                  </p>
                )}
                {rec.action_href ? (
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href={rec.action_href}>
                      {rec.action_label || "Open"}
                    </Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {weeklyReview ? (
        <section className="mt-8 space-y-3 border-t border-border/70 pt-6">
          <h2 className="font-heading text-lg font-semibold">
            Latest weekly review
          </h2>
          <p className="text-xs text-muted-foreground capitalize">
            {weeklyReview.confidence} confidence
          </p>
          {(
            [
              ["What happened", weeklyReview.what_happened],
              ["What worked", weeklyReview.what_worked],
              ["What didn't", weeklyReview.what_didnt],
              ["What we learned", weeklyReview.what_we_learned],
              ["What to do next", weeklyReview.what_to_do_next],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <p className="jacita-label">{label}</p>
              <p className="mt-1 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </section>
      ) : null}

      {(snapshot?.campaigns || []).some((c) => c.totals.row_count > 0) ? (
        <section className="mt-8 space-y-3">
          <h2 className="font-heading text-lg font-semibold">
            Campaign performance
          </h2>
          <ul className="space-y-3">
            {snapshot!.campaigns
              .filter((c) => c.totals.row_count > 0 || c.contentPublished > 0)
              .map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.objective || "No objective"} · {c.contentPublished}{" "}
                      published
                    </p>
                  </div>
                  <span className="capitalize text-muted-foreground">
                    {c.rating.replaceAll("_", " ")}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
