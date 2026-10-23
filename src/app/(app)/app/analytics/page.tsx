import Link from "next/link";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getOverview } from "@/lib/dashboard/overview";
import { PerformancePanel } from "@/components/dashboard/performance-panel";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { Button } from "@/components/ui/button";
import { AnalyticsActions } from "./analytics-actions";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const organisations = await getUserOrganisations();
  const active = await getActiveOrganisation(organisations);
  const db = await createClient();
  let data = null;
  let error = false;
  if (active) {
    try {
      data = await getOverview(db, active.id, days);
    } catch {
      error = true;
    }
  }
  const [recs, review] = active
    ? await Promise.all([
        db
          .from("ai_insights")
          .select(
            "id, title, insight_text, evidence, priority, confidence, action_label, action_href",
          )
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .eq("insight_type", "recommendation")
          .order("created_at", { ascending: false })
          .limit(6),
        db
          .from("marketing_weekly_reviews")
          .select(
            "what_happened, what_worked, what_didnt, what_we_learned, what_to_do_next, confidence",
          )
          .eq("organisation_id", active.id)
          .order("week_start", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];
  const recommendations = recs.data ?? [];
  const weeklyReview = review.data;
  return (
    <div className="jacita-page jacita-enter">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Evidence before decisions</p>
          <h1 className="mt-2 text-3xl font-semibold">Analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Performance for {active?.name ?? "your business"}. Each platform and
            data source is reported separately.
          </p>
        </div>
        {active && <AnalyticsActions organisationId={active.id} />}
      </header>
      <div className="flex justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Business scope follows the sidebar switcher.
        </p>
        <PeriodFilter days={days} />
      </div>
      {error && (
        <div className="workspace-error" role="alert">
          Performance data could not be loaded. Refresh to try again.
        </div>
      )}
      {data ? (
        <PerformancePanel
          metrics={data.metrics}
          from={data.from}
          to={data.to}
          days={days}
          timezone={data.timezone}
        />
      ) : (
        <section className="glass-panel p-8">
          <h2>Performance unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a business and connect its accounts to start collecting
            metrics.
          </p>
          <Link href="/app/social" className="mt-4 inline-block text-primary">
            Manage connections →
          </Link>
        </section>
      )}
      <section className="glass-panel p-5">
        <h2 className="font-semibold">Understand the source</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Provider data shows stored metrics marked live, rather than a
          real-time feed. Manual and sample records have separate filters.
          Missing measurements stay unknown. Enquiries, recorded bookings and
          clicks have different meanings; booking confirmation and sales
          attribution are not verified by the current model.
        </p>
      </section>
      {(recommendations.length > 0 || weeklyReview) && (
        <p className="text-xs text-muted-foreground">
          Saved AI analysis below may use a different period or include sample
          data. Check the evidence before acting.
        </p>
      )}
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
    </div>
  );
}
