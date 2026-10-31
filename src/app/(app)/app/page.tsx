import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCheck,
  CircleAlert,
  FileCheck2,
  Layers3,
  Radio,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  getActiveOrganisation,
  getSessionUser,
  getUserOrganisations,
} from "@/lib/org";
import { getOverview } from "@/lib/dashboard/overview";
import { createClient } from "@/lib/supabase/server";
import { PerformancePanel } from "@/components/dashboard/performance-panel";
import { OutcomesPanel } from "@/components/dashboard/outcomes-panel";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { MarketingStudio } from "@/components/studio/marketing-studio";
import { Button } from "@/components/ui/button";
import { getStudioSnapshot } from "@/lib/studio/snapshot";
import type { StudioSnapshot } from "@/lib/studio/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const days = params.range === "30d" ? 30 : params.range === "90d" ? 90 : 7;
  const [orgs, user] = await Promise.all([
    getUserOrganisations(),
    getSessionUser(),
  ]);
  const active = await getActiveOrganisation(orgs);
  let data = null;
  let error = false;
  let studio: StudioSnapshot | null = null;
  let studioError = false;
  if (active) {
    const db = await createClient();
    // Independent reads: a studio failure must not hide the overview, or vice versa.
    const [overview, snapshot] = await Promise.allSettled([
      getOverview(db, active.id, days),
      getStudioSnapshot(db, active.id),
    ]);
    if (overview.status === "fulfilled") data = overview.value;
    else error = true;
    if (snapshot.status === "fulfilled") studio = snapshot.value;
    else studioError = true;
  }
  const automation = data?.settings;
  const automationState = automation?.paused
    ? "Paused"
    : automation?.enabled && automation.mode !== "off"
      ? `${automation.mode} enabled`
      : "Off";
  const stats = [
    {
      label: "Active businesses",
      value: orgs.filter((o) => o.status === "active").length,
      note: "Across your workspace",
      href: "/app/businesses",
      icon: Building2,
    },
    {
      label: "Awaiting approval",
      value: data?.totals.review,
      note: "Drafts ready for your review",
      href: "/app/content?status=review",
      icon: FileCheck2,
    },
    {
      label: "Scheduled posts",
      value: data?.totals.scheduled,
      note: "Queued · not yet published",
      href: "/app/content?status=scheduled",
      icon: CalendarDays,
    },
    {
      label: "Confirmed publications",
      value: data?.publications,
      note: `Provider confirmations · ${days} days`,
      href: "/app/social",
      icon: CheckCheck,
    },
    {
      label: "Needs attention",
      value: data?.attentionCount,
      note:
        data && !data.holdsAvailable
          ? "Known items · holds unavailable"
          : "Content, connections & setup",
      href: "#weekly-review",
      icon: CircleAlert,
    },
  ];
  const pipeline = [
    {
      label: "Draft",
      count: data?.totals.draft,
      status: "draft",
      detail: "Brief & caption in progress",
      tone: "neutral",
    },
    {
      label: "In review",
      count: data?.totals.review,
      status: "review",
      detail: "Waiting for approval",
      tone: "purple",
    },
    {
      label: "Approved",
      count: data?.totals.approved,
      status: "approved",
      detail: "Signed off · not queued",
      tone: "teal",
    },
    {
      label: "Scheduled",
      count: data?.totals.scheduled,
      status: "scheduled",
      detail: "Queued for a future time",
      tone: "teal",
    },
    {
      label: "Publishing",
      count: data?.totals.publishing,
      status: "publishing",
      detail: "Awaiting provider outcome",
      tone: "purple",
    },
    {
      label: "Published",
      count: data?.publishedContent,
      status: "published",
      detail: "Provider confirmed · all time",
      tone: "teal",
    },
  ];
  const money = (pence: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(pence / 100);
  return (
    <div className="overview jacita-enter">
      <header className="overview-heading">
        <div>
          <p className="eyebrow">
            <span className="signal-dot" /> Your marketing workspace
          </p>
          <h1>
            {user?.full_name
              ? `${user.full_name.split(" ")[0]}, here’s the overview.`
              : "Your weekly overview."}
          </h1>
          <p>
            A clearer view of what’s ready, what’s working and what needs you.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/content/new">
            <Sparkles size={15} /> Create content
          </Link>
        </Button>
      </header>
      <div className="overview-toolbar">
        <span>
          <Building2 size={14} /> {active?.name ?? "No business selected"}
          <span className="scope-label">Business view</span>
        </span>
        <PeriodFilter days={days} />
      </div>
      {error && (
        <div role="alert" className="workspace-error">
          <CircleAlert size={18} />
          <div>
            <strong>Workspace data could not be loaded</strong>
            <p>
              Totals are unavailable. Your saved records have not changed.{" "}
              <Link href={`/app?range=${days}d`}>Try again</Link>
            </p>
          </div>
        </div>
      )}
      {!active && (
        <div className="glass-panel p-6">
          <h2>Select a business to begin</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Open Businesses to select a client or complete onboarding.
          </p>
          <Link className="text-primary" href="/app/businesses">
            Open businesses →
          </Link>
        </div>
      )}
      <section className="summary-grid" aria-label="Workspace summary">
        {stats.map((stat, i) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`glass-panel summary-card summary-${i}`}
          >
            <div className="summary-label">
              <span>{stat.label}</span>
              <stat.icon size={16} />
            </div>
            <strong>
              {stat.value === undefined
                ? "—"
                : stat.value.toLocaleString("en-GB")}
            </strong>
            <div className="summary-note">
              {stat.note}
              <ArrowUpRight size={13} />
            </div>
          </Link>
        ))}
      </section>
      <MarketingStudio
        key={active?.id ?? "no-business"}
        organisationId={active?.id ?? null}
        businessName={active?.name ?? "No business selected"}
        initialSnapshot={studio}
        initialError={studioError}
        organisations={orgs}
        active={active}
        canAddBusiness={Boolean(user?.is_platform_admin)}
      />
      <div className="overview-grid">
        <section
          className="glass-panel review-panel"
          id="weekly-review"
          aria-labelledby="review-title"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your next moves</p>
              <h2 id="review-title">
                Weekly review{" "}
                <span className="count-badge">
                  {data?.attentionCount ?? "—"}
                </span>
              </h2>
            </div>
            <FileCheck2 size={18} className="text-primary" />
          </div>
          <p className="panel-subtitle">Move the right work forward.</p>
          {data?.queue.length ? (
            <ul className="review-list">
              {data.queue.map((item) => (
                <li key={item.id}>
                  <span
                    className={`review-marker ${item.urgent ? "urgent" : ""}`}
                  />
                  <div>
                    <span className="review-business">{active?.name}</span>
                    <h3>{item.title}</h3>
                    <p>{item.reason}</p>
                    <Link href={item.href}>
                      {item.action}
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small-empty">
              <ShieldCheck size={26} />
              <strong>
                {error ? "Review queue unavailable" : "You’re up to date"}
              </strong>
              <p>
                {error
                  ? "Please retry loading your records."
                  : "No pending reviews or setup issues for this business."}
              </p>
            </div>
          )}
          <Link href="/app/content?status=review" className="panel-bottom-link">
            Open approval queue <ArrowUpRight size={14} />
          </Link>
        </section>
        {data ? (
          <PerformancePanel
            metrics={data.metrics}
            from={data.from}
            to={data.to}
            days={days}
            timezone={data.timezone}
          />
        ) : (
          <section className="glass-panel performance-panel chart-empty">
            <Radio size={28} />
            <h2>Performance unavailable</h2>
            <p>
              {error
                ? "Retry loading your business records."
                : "Select a business to see its performance."}
            </p>
            <Link href="/app/analytics">Open analytics →</Link>
          </section>
        )}
        <section
          className="glass-panel pipeline-panel"
          aria-labelledby="pipeline-title"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">From idea to audience</p>
              <h2 id="pipeline-title">Content pipeline</h2>
            </div>
            <Link href="/app/content" className="text-link">
              Content Studio <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="pipeline-stages">
            {pipeline.map((stage, i) => (
              <Link
                key={stage.label}
                href={`/app/content?status=${stage.status}`}
                className={`pipeline-stage ${stage.tone}`}
              >
                <span>
                  <i />
                  {stage.label}
                  {i < 5 && <ArrowRight size={12} />}
                </span>
                <strong>{stage.count ?? "—"}</strong>
                <small>{stage.detail}</small>
              </Link>
            ))}
          </div>
          <div className="pipeline-footnote">
            <Layers3 size={13} />
            <span>
              Briefs live within drafts. Published content and failed items have
              separate records.
            </span>
            <Link href="/app/content?status=published">
              Published <ArrowUpRight size={12} />
            </Link>
            {(data?.totals.failed ?? 0) > 0 && (
              <Link href="/app/content?status=failed">
                {data?.totals.failed} failed
              </Link>
            )}
          </div>
          <p className="metric-caveat">
            A scheduled post stays scheduled until publishing starts. Only a
            provider confirmation counts as a confirmed publication; simulations
            are excluded.
          </p>
        </section>
        <OutcomesPanel
          metrics={data?.metrics ?? []}
          from={data?.from ?? ""}
          to={data?.to ?? ""}
          campaigns={data?.campaigns ?? []}
        />
        <section className="glass-panel health-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Keep things moving</p>
              <h2>Business health</h2>
            </div>
            <Radio size={18} className="text-primary" />
          </div>
          <div className="health-rows">
            <Link href="/app/social">
              <span>Account connections</span>
              <strong>
                {data
                  ? `${data.accounts.filter((a) => a.connection_status === "connected" && !["attention", "reauth_required"].includes(a.health_status)).length} healthy / ${data.accounts.length} accounts`
                  : "Unavailable"}
                <ArrowUpRight size={13} />
              </strong>
            </Link>
            <Link href="/app/automation">
              <span>Automation</span>
              <strong className="capitalize">
                {data ? automationState : "Unavailable"}
                <ArrowUpRight size={13} />
              </strong>
            </Link>
            <Link href="/app/campaigns">
              <span>Upcoming campaigns</span>
              <strong>
                {data
                  ? data.campaigns.filter(
                      (c) => c.start_date && c.start_date > data.to,
                    ).length
                  : "—"}
                <ArrowUpRight size={13} />
              </strong>
            </Link>
            <Link href="/app/automation">
              <span>Publishing holds</span>
              <strong>
                {data?.heldCount ?? "Tracking unavailable"}
                <ArrowUpRight size={13} />
              </strong>
            </Link>
          </div>
          <p className="metric-caveat">
            {automation?.state_message ||
              "Approval rules and publishing holds are managed in Automation."}
          </p>
          <Link
            href="/app/settings?section=brand"
            className="panel-bottom-link"
          >
            Brand rules & approved facts <ArrowUpRight size={14} />
          </Link>
        </section>
        <section className="glass-panel cost-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Know the running cost</p>
              <h2>Operating costs</h2>
            </div>
            <Wallet size={18} className="text-muted-foreground" />
          </div>
          <div className="cost-total">
            <strong>
              {data && data.costs.count > data.costs.unsettled
                ? money(data.costs.calculated)
                : "—"}
            </strong>
            <span>Usage-based AI estimate · {days} days</span>
          </div>
          <div className="attribution-row">
            <span>
              Pending usage ·{" "}
              {data?.costs.available ? data.costs.unsettled : "—"} calls
            </span>
            <strong>
              {data?.costs.count ? money(data.costs.estimated) : "—"}
            </strong>
          </div>
          <p className="metric-caveat">
            {data && !data.costs.available
              ? "Cost tracking is unavailable in the configured backend. No operating-cost total can be verified."
              : data?.costs.count
                ? "Calculated from reported tokens and the app’s price table. Provider invoices, media production and other operating costs are not tracked here."
                : "No AI usage recorded in this period. Provider invoices and other operating costs are not tracked."}
          </p>
          <Link href="/app/settings?section=ai" className="panel-bottom-link">
            Usage & spending limits <ArrowUpRight size={14} />
          </Link>
        </section>
        <section className="glass-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">The work behind the scenes</p>
              <h2>Recent automation activity</h2>
            </div>
            <Link href="/app/automation" className="text-link">
              Open control centre <ArrowUpRight size={14} />
            </Link>
          </div>
          {data?.activity.length ? (
            <ul className="activity-list">
              {data.activity.map((item) => (
                <li key={item.id}>
                  <span
                    className={
                      item.severity === "error"
                        ? "review-marker urgent"
                        : "signal-dot"
                    }
                  />
                  <p>{item.message}</p>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString("en-GB", {
                      timeZone: data.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-subtitle">
              {error
                ? "Activity is unavailable. Please retry."
                : "No automation activity recorded yet. Configure approval rules in Automation to get started."}
            </p>
          )}
        </section>
      </div>
      <footer className="overview-footer">
        <span>
          <ShieldCheck size={13} /> Private workspace ·{" "}
          {active?.name ?? "JACITA"}
        </span>
        <span>
          Stored business records · {data?.timezone ?? "Timezone unavailable"}
        </span>
      </footer>
    </div>
  );
}
