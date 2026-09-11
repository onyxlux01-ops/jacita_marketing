"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow, startOfDay, addDays } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  pauseAutomation,
  resumeAutomation,
  changeAutomationMode,
  saveAutomationSettings,
  emergencyStopAutomation,
  approveContent,
  rejectContent,
  skipContent,
  runAutomationNow,
} from "@/app/(app)/app/actions/automation";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Pause,
  Play,
  Square,
  Zap,
} from "lucide-react";
import { SocialPreview } from "@/components/content/social-preview";
import { PlatformPill } from "@/components/content/platform-icons";
import type { MetaSurfaceSnapshot } from "@/components/automation/meta-connections-panel";
import type { AiProviderHealth } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  AUTOMATION_GOAL_OPTIONS,
  CONTENT_PREFERENCE_OPTIONS,
  type AutomationMode,
  type AiFreedomLevel,
} from "@/lib/automation/settings";
import type {
  AttentionItem,
  UpcomingContentItem,
  WorkQueueItem,
} from "@/lib/automation/control";
import { cn } from "@/lib/utils";

type StatusSnapshot = {
  organisationId: string;
  enabled: boolean;
  paused: boolean;
  mode: AutomationMode;
  currentlyLabel: string;
  nextLabel: string;
  scheduledCount: number;
  publishedThisWeek: number;
  active: boolean;
  setupCompletedAt: string | null;
  freedomLevel: AiFreedomLevel;
  postsPerWeek: number;
  storiesPerWeek: number;
  reelsPerWeek: number;
  platforms: string[];
  contentPreferences: string[];
  primaryGoals: string[];
  decision: {
    decision: string;
    why: string;
    action: string;
    confidence?: string | null;
  } | null;
  hero: {
    tone: "active" | "paused" | "off";
    title: string;
    subtitle: string;
  };
  lastError: string | null;
};

type ActivitySnapshot = {
  label: string;
  detail: string | null;
  reason: string | null;
  progressNote: string | null;
};

type InsightRow = {
  id: string;
  text: string;
  evidence: string | null;
  confidence: string | null;
  changed: string | null;
  created_at: string;
};

type TimelineRow = {
  id: string;
  event_type: string;
  message: string;
  severity: string;
  created_at: string;
};

type PublishedRow = {
  id: string;
  title: string | null;
  hook: string | null;
  published_at: string | null;
  content_type: string | null;
  platforms: string[];
};

type HealthSnapshot = {
  status: string;
  label: string;
  attentionCount: number;
};

const MODE_COPY: Record<
  Exclude<AutomationMode, "off">,
  { title: string; desc: string }
> = {
  manual: {
    title: "Manual",
    desc: "AI recommends. You control everything.",
  },
  approval: {
    title: "Approval",
    desc: "AI prepares content. You approve before publishing.",
  },
  autopilot: {
    title: "Autopilot",
    desc: "AI creates, schedules and publishes within your rules.",
  },
};

function whenLabel(iso: string | null) {
  if (!iso) return "Soon";
  const d = new Date(iso);
  if (isToday(d)) return `Today Â· ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow Â· ${format(d, "HH:mm")}`;
  return format(d, "EEE d MMM Â· HH:mm");
}

function contentTypeLabel(type: string | null) {
  if (!type) return "Post";
  return type.replaceAll("_", " ");
}

export function AutomationControlCentre({
  businessName,
  initialStatus,
  initialActivity,
  initialWorkQueue,
  initialUpcoming,
  initialApprovals,
  initialPublished,
  initialInsights,
  initialTimeline,
  initialAttention,
  initialHealth,
  readiness,
  metaSurface = null,
  aiHealth = null,
}: {
  businessName: string;
  initialStatus: StatusSnapshot;
  initialActivity: ActivitySnapshot;
  initialWorkQueue: WorkQueueItem[];
  initialUpcoming: UpcomingContentItem[];
  initialApprovals: UpcomingContentItem[];
  initialPublished: PublishedRow[];
  initialInsights: InsightRow[];
  initialTimeline: TimelineRow[];
  initialAttention: AttentionItem[];
  initialHealth: HealthSnapshot;
  readiness: {
    ready: boolean;
    checks: Array<{ id: string; label: string; ok: boolean }>;
  };
  metaSurface?: MetaSurfaceSnapshot | null;
  aiHealth?: AiProviderHealth | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [activity, setActivity] = useState(initialActivity);
  const [workQueue, setWorkQueue] = useState(initialWorkQueue);
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [published, setPublished] = useState(initialPublished);
  const [insights, setInsights] = useState(initialInsights);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [attention, setAttention] = useState(initialAttention);
  const [health, setHealth] = useState(initialHealth);

  const [pauseOpen, setPauseOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState<AutomationMode | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [posts, setPosts] = useState(initialStatus.postsPerWeek);
  const [stories, setStories] = useState(initialStatus.storiesPerWeek);
  const [reels, setReels] = useState(initialStatus.reelsPerWeek);
  const [platforms, setPlatforms] = useState(initialStatus.platforms);
  const [prefs, setPrefs] = useState(initialStatus.contentPreferences);
  const [goals, setGoals] = useState(initialStatus.primaryGoals);
  const [freedom, setFreedom] = useState(initialStatus.freedomLevel);

  const orgId = status.organisationId;
  const previewItem = useMemo(
    () =>
      [...approvals, ...upcoming].find((i) => i.id === previewId) || null,
    [approvals, upcoming, previewId]
  );

  // Keep props in sync when business switches (server re-render)
  useEffect(() => {
    setStatus(initialStatus);
    setActivity(initialActivity);
    setWorkQueue(initialWorkQueue);
    setUpcoming(initialUpcoming);
    setApprovals(initialApprovals);
    setPublished(initialPublished);
    setInsights(initialInsights);
    setTimeline(initialTimeline);
    setAttention(initialAttention);
    setHealth(initialHealth);
    setPosts(initialStatus.postsPerWeek);
    setStories(initialStatus.storiesPerWeek);
    setReels(initialStatus.reelsPerWeek);
    setPlatforms(initialStatus.platforms);
    setPrefs(initialStatus.contentPreferences);
    setGoals(initialStatus.primaryGoals);
    setFreedom(initialStatus.freedomLevel);
  }, [
    initialStatus,
    initialActivity,
    initialWorkQueue,
    initialUpcoming,
    initialApprovals,
    initialPublished,
    initialInsights,
    initialTimeline,
    initialAttention,
    initialHealth,
  ]);

  // Realtime - refresh when this business changes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`automation-cc-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automation_settings",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automation_activity",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "content",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automation_tasks",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  const showEmptySetup = !status.setupCompletedAt && !status.active;

  const weekStrip = useMemo(() => {
    const start = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const dayMs = day.getTime();
      const items = upcoming.filter((u) => {
        const raw = u.scheduled_at || u.suggested_posting_time;
        if (!raw) return false;
        return startOfDay(new Date(raw)).getTime() === dayMs;
      });
      return { day, items, isToday: i === 0 };
    });
  }, [upcoming]);

  const ads = metaSurface?.advertising;
  const adConnected =
    metaSurface?.adAccount && metaSurface.adAccount.connected === true
      ? metaSurface.adAccount
      : null;

  return (
    <div className="relative space-y-9 pb-32 lg:space-y-11">
      {aiHealth && !aiHealth.live ? (
        <section
          className="rounded-xl border border-amber-500/35 bg-amber-50/80 px-4 py-3.5 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">
            {aiHealth.reason === "billing"
              ? "OpenAI credits required"
              : "OpenAI is not live"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed opacity-90">
            {aiHealth.message} Automation can still run, but content and
            insights will use safe demo fallbacks until OpenAI is available.
          </p>
          {aiHealth.reason === "billing" || aiHealth.reason === "invalid_key" ? (
            <a
              href="https://platform.openai.com/settings/organization/billing/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-[13px] font-medium underline underline-offset-2"
            >
              Open OpenAI billing
            </a>
          ) : null}
        </section>
      ) : aiHealth?.live ? (
        <p className="text-xs text-muted-foreground">
          OpenAI live · {aiHealth.model}
        </p>
      ) : null}

      {/* Asymmetric status hero + compact metrics */}
      <section className="jacita-stage jacita-enter rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--primary)_7%,transparent),transparent_58%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.8fr)] lg:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity
                className={cn(
                  "size-4 shrink-0",
                  status.hero.tone === "active" && "text-primary",
                  status.hero.tone === "paused" && "text-amber-600",
                  status.hero.tone === "off" && "text-muted-foreground"
                )}
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">{businessName}</p>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span
                className={cn(
                  "mt-2.5 inline-flex size-2.5 shrink-0 rounded-full",
                  status.hero.tone === "active" &&
                    "bg-emerald-500 shadow-[0_0_0_4px_color-mix(in_oklab,rgb(16,185,129)_22%,transparent)]",
                  status.hero.tone === "paused" && "bg-amber-500",
                  status.hero.tone === "off" && "bg-muted-foreground/40"
                )}
                aria-hidden
              />
              <div>
                <h2 className="font-heading text-[1.65rem] font-semibold leading-[1.15] tracking-tight sm:text-[1.85rem]">
                  {status.hero.title}
                </h2>
                <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-muted-foreground">
                  {status.hero.subtitle}
                </p>
              </div>
            </div>
            <div
              className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm"
              aria-live="polite"
            >
              <p>
                <span className="text-muted-foreground">Currently </span>
                <span className="font-medium text-foreground">
                  {activity.label}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Next </span>
                <span className="font-medium text-foreground">
                  {status.nextLabel}
                </span>
              </p>
            </div>
          </div>

          <div
            className="jacita-metric-strip grid-cols-2 sm:grid-cols-4 lg:grid-cols-2"
            role="group"
            aria-label="Automation metrics"
          >
            <MetricCell
              label="Scheduled"
              value={String(status.scheduledCount)}
              hint="in pipeline"
            />
            <MetricCell
              label="Published"
              value={String(status.publishedThisWeek)}
              hint="this week"
            />
            <MetricCell
              label="Attention"
              value={String(attention.length)}
              hint={attention.length ? "needs you" : "clear"}
              tone={attention.length ? "warn" : "ok"}
            />
            <MetricCell
              label="Health"
              value={health.label}
              hint={status.mode === "off" ? "off" : status.mode}
              tone={
                health.status === "critical"
                  ? "bad"
                  : health.status === "attention"
                    ? "warn"
                    : "ok"
              }
            />
          </div>
        </div>
      </section>

      {showEmptySetup ? (
        <section className="rounded-xl border border-dashed border-border px-5 py-8 text-center sm:px-8">
          <h3 className="font-heading text-xl font-semibold">
            Your AI marketing isn&apos;t set up yet
          </h3>
          <ol className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-muted-foreground">
            {[
              "Add marketing goals",
              "Add services / products",
              "Upload media",
              "Connect social accounts",
              "Start automation",
            ].map((step, i) => (
              <li key={step} className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground/70">
                  {i + 1}.
                </span>
                {step}
              </li>
            ))}
          </ol>
          <ul className="mx-auto mt-5 max-w-md space-y-1.5 text-left text-sm">
            {readiness.checks.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span>{c.label}</span>
                <span className={c.ok ? "text-primary" : "text-amber-700"}>
                  {c.ok ? "Ready" : "Needed"}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-6">
            <Link href="/app/automation/setup">Set up automation</Link>
          </Button>
        </section>
      ) : null}

            {/* Week strip - operational calendar */}
      <section className="jacita-enter-delay-1 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="font-heading text-lg font-semibold tracking-tight">
            This week
          </h3>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 touch-pan-x">
          {weekStrip.map(({ day, items, isToday: today }) => (
            <div
              key={day.toISOString()}
              className={cn(
                "jacita-day-chip",
                today && "jacita-day-chip-today"
              )}
            >
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                {format(day, "EEE")}
              </p>
              <p className="font-heading text-base font-semibold tabular-nums tracking-tight">
                {format(day, "d")}
              </p>
              <ul className="mt-2 min-h-[4.75rem] space-y-1.5">
                {items.length === 0 ? (
                  <li className="text-[11px] text-muted-foreground/65">Open</li>
                ) : (
                  items.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/app/content/${item.id}`}
                        className="jacita-press block rounded-lg bg-muted/55 px-1.5 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                          {item.scheduled_at
                            ? format(new Date(item.scheduled_at), "HH:mm")
                            : "--:--"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1">
                          {item.platforms[0] ? (
                            <PlatformPill
                              platform={
                                item.platforms[0] as
                                  | "instagram"
                                  | "facebook"
                                  | "tiktok"
                              }
                            />
                          ) : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/90">
                          {item.hook || item.title || "Post"}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
                {items.length > 3 ? (
                  <li className="text-[10px] tabular-nums text-muted-foreground">
                    +{items.length - 3} more
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

{/* Ops grid: AI activity + Meta ads snapshot */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">AI is working on</h3>
          <div className="jacita-panel rounded-xl px-4 py-4">
            <p className="text-[15px] font-medium">{activity.label}</p>
            {activity.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {activity.detail}
              </p>
            ) : null}
            {activity.progressNote ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Progress: {activity.progressNote}
              </p>
            ) : null}
            {activity.reason ? (
              <p className="mt-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-foreground/85">
                <span className="text-xs font-medium text-muted-foreground">
                  Reason
                </span>
                <br />
                {activity.reason}
              </p>
            ) : null}
          </div>

          {workQueue.length > 0 ? (
            <div className="rounded-xl border border-border/70 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                AI work queue
              </p>
              <ul className="mt-2 space-y-1.5">
                {workQueue.map((q) => (
                  <li
                    key={q.key}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{q.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {q.status === "done"
                        ? "done"
                        : q.status === "active"
                          ? "active"
                          : q.status === "failed"
                            ? "failed"
                            : "queued"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {status.decision ? (
            <div className="jacita-panel space-y-3 rounded-xl px-4 py-4">
              <p className="text-xs font-medium text-muted-foreground">
                Latest decision
              </p>
              <p className="text-[15px] font-medium">{status.decision.decision}</p>
              <p className="text-sm leading-relaxed text-foreground/85">
                {status.decision.why}
              </p>
              <p className="text-sm font-medium">{status.decision.action}</p>
            </div>
          ) : null}
        </section>

        <div className="space-y-6">
          {/* Meta ads snapshot - not full Ads Manager */}
          {metaSurface ? (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold">Meta ads</h3>
                <Link
                  href="/app/social"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Manage connections
                </Link>
              </div>
              <div className="jacita-panel divide-y divide-border/70 rounded-xl">
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Ad account</span>
                  <span className="truncate font-medium">
                    {adConnected
                      ? adConnected.name || adConnected.externalId
                      : "Not connected"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border/60">
                  <div className="bg-card px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">Mode</p>
                    <p className="mt-0.5 text-sm font-medium capitalize">
                      {ads?.mode || "approval"}
                    </p>
                  </div>
                  <div className="bg-card px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">
                      Active campaigns
                    </p>
                    <p className="mt-0.5 font-heading text-lg font-semibold">
                      {ads?.activeCampaigns ?? 0}
                    </p>
                  </div>
                  <div className="bg-card px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">
                      Spend (7d)
                    </p>
                    <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                      {((ads?.spend7d ?? 0) / 100).toLocaleString(undefined, {
                        style: "currency",
                        currency: adConnected?.currency || "USD",
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="bg-card px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">
                      Pending approvals
                    </p>
                    <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                      {ads?.pendingApprovals.length ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="font-heading text-lg font-semibold">
              Needs your attention
              {attention.length > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-800 tabular-nums">
                  {attention.length}
                </span>
              ) : null}
            </h3>
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing needs your attention.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 border-y border-border/70">
                {attention.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex gap-2">
                      <AlertTriangle
                        className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="shrink-0 text-sm font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Approval queue */}
      {status.mode === "approval" || approvals.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">
            Waiting for approval
            {approvals.length > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary tabular-nums">
                {approvals.length}
              </span>
            ) : null}
          </h3>
          {approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No content waiting. AI will prepare the next batch automatically.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {approvals.map((item) => (
                <li
                  key={item.id}
                  className="jacita-panel rounded-xl p-3"
                >
                  <SocialPreview
                    platform={item.platforms[0] || "instagram"}
                    businessName={businessName}
                    caption={item.caption || undefined}
                    hook={item.hook || undefined}
                    hashtags={item.hashtags}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await approveContent({
                            organisationId: orgId,
                            contentId: item.id,
                          });
                          if ("error" in res && res.error) toast.error(res.error);
                          else {
                            toast.success("Approved - queued to publish");
                            router.refresh();
                          }
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/app/content/${item.id}`}>Edit</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await rejectContent({
                            organisationId: orgId,
                            contentId: item.id,
                          });
                          if ("error" in res && res.error) toast.error(res.error);
                          else {
                            toast.message("Rejected - AI will learn");
                            router.refresh();
                          }
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Coming up list (detail beyond week strip) */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Coming up</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming posts yet. Start or resume automation to fill the pipeline.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {upcoming.slice(0, 8).map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => setPreviewId(item.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {item.platforms[0] ? (
                      <PlatformPill
                        platform={item.platforms[0] as "instagram" | "facebook" | "tiktok"}
                      />
                    ) : null}
                    <span className="text-xs capitalize text-muted-foreground">
                      {contentTypeLabel(item.content_type)}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      Â· {item.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">
                    {item.hook || item.title || "Untitled"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {whenLabel(item.scheduled_at || item.suggested_posting_time)}
                    {item.service_name ? ` Â· ${item.service_name}` : ""}
                  </p>
                </button>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/app/content/${item.id}`}>View</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/app/content/${item.id}`}>Edit</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await skipContent({
                          organisationId: orgId,
                          contentId: item.id,
                        });
                        if ("error" in res && res.error) toast.error(res.error);
                        else {
                          toast.message("Skipped - will not publish");
                          router.refresh();
                        }
                      })
                    }
                  >
                    Skip
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Published + learned */}
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">
            Recently published
          </h3>
          {published.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Published posts will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {published.map((item) => (
                <li key={item.id} className="py-3 text-sm">
                  <Link href={`/app/content/${item.id}`} className="block hover:bg-muted/30">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.platforms[0] ? (
                        <PlatformPill
                          platform={
                            item.platforms[0] as
                              | "instagram"
                              | "facebook"
                              | "tiktok"
                          }
                        />
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {item.published_at
                          ? whenLabel(item.published_at)
                          : "Published"}{" "}
                        Â· Published
                      </span>
                    </div>
                    <p className="mt-1 font-medium">
                      {item.title || item.hook || "Post"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">AI learned</h3>
          {insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Meaningful learnings appear after a few published posts.
            </p>
          ) : (
            <ul className="space-y-4">
              {insights.map((row) => (
                <li key={row.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-[15px] leading-relaxed">{row.text}</p>
                  {row.evidence ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Evidence: {row.evidence}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    {row.confidence ? (
                      <span>Confidence: {row.confidence}</span>
                    ) : null}
                    {row.changed ? <span>Changed: {row.changed}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Timeline */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">Activity</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Automation activity will show here as AI works.
          </p>
        ) : (
          <ol className="relative ml-1.5 space-y-0 border-l border-border/80">
            {timeline.map((row) => (
              <li key={row.id} className="relative pb-5 pl-5">
                <span
                  className={cn(
                    "absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-background",
                    row.severity === "error"
                      ? "bg-red-500"
                      : row.severity === "warning"
                        ? "bg-amber-500"
                        : row.severity === "success"
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/50"
                  )}
                />
                <p className="font-mono text-[11px] text-muted-foreground">
                  {format(new Date(row.created_at), "HH:mm")}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed">{row.message}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Modes */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Mode</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(MODE_COPY) as Array<keyof typeof MODE_COPY>).map(
            (id) => (
              <button
                key={id}
                type="button"
                disabled={pending}
                onClick={() => setModeOpen(id)}
                className={cn(
                  "jacita-press cursor-pointer rounded-xl border px-4 py-3.5 text-left transition-colors",
                  status.mode === id
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:bg-muted/40"
                )}
              >
                <p className="text-sm font-medium">{MODE_COPY[id].title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {MODE_COPY[id].desc}
                </p>
              </button>
            )
          )}
        </div>
      </section>

      {/* Settings */}
      <section className="jacita-panel space-y-6 rounded-xl p-5 sm:p-6">
        <div>
          <h3 className="font-heading text-lg font-semibold">
            Automation settings
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Preferences and constraints. AI optimises within these rules -
            guardrails always apply.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Marketing goals
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUTOMATION_GOAL_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoals(toggle(goals, g.id))}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs",
                  goals.includes(g.id)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Platforms</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["instagram", "facebook", "tiktok"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatforms(toggle(platforms, p))}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs capitalize",
                  platforms.includes(p)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Posts / week
            <input
              type="number"
              min={0}
              max={28}
              value={posts}
              onChange={(e) => setPosts(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Stories / week
            <input
              type="number"
              min={0}
              max={28}
              value={stories}
              onChange={(e) => setStories(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Short videos / week
            <input
              type="number"
              min={0}
              max={21}
              value={reels}
              onChange={(e) => setReels(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Content mix
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONTENT_PREFERENCE_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrefs(toggle(prefs, p.id))}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs",
                  prefs.includes(p.id)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            AI control
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(
              [
                ["conservative", "Conservative", "Changes strategy slowly"],
                ["balanced", "Balanced", "Adapts based on evidence"],
                ["aggressive", "Aggressive", "Experiments more often"],
              ] as const
            ).map(([id, title, desc]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFreedom(id)}
                className={cn(
                  "cursor-pointer rounded-xl border px-3 py-2.5 text-left",
                  freedom === id
                    ? "border-primary bg-primary/5"
                    : "border-border/70"
                )}
              >
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Never overrides safety guardrails (no invented prices, offers, or
            ads).
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await saveAutomationSettings({
                  organisationId: orgId,
                  postsPerWeek: posts,
                  storiesPerWeek: stories,
                  reelsPerWeek: reels,
                  platforms,
                  contentPreferences: prefs,
                  primaryGoals: goals,
                  aiFreedomLevel: freedom,
                });
                if ("error" in res && res.error) toast.error(res.error);
                else toast.success("Settings saved");
              })
            }
          >
            Save settings
          </Button>
        </div>
      </section>

            {/* Slim frosted command dock - signature material, no glow */}
      <div
        className="jacita-dock fixed inset-x-0 bottom-0 z-40 border-t border-border/60 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        role="region"
        aria-label="AI automation controls"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium tracking-tight">
              <span className="text-muted-foreground">AI is </span>
              {activity.label}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {status.nextLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending || status.mode === "off"}
              className="jacita-press h-11 min-w-[7.5rem] cursor-pointer sm:h-9 sm:min-w-0"
              onClick={() =>
                startTransition(async () => {
                  const res = await runAutomationNow(orgId);
                  if ("error" in res && res.error) toast.error(res.error);
                  else {
                    toast.success("AI is running a fresh cycle");
                    router.refresh();
                  }
                })
              }
            >
              <Zap className="size-3.5" aria-hidden />
              Run cycle
            </Button>
            {status.paused || !status.active ? (
              <Button
                size="sm"
                disabled={pending}
                className="jacita-press h-11 min-w-[7.5rem] cursor-pointer sm:h-9 sm:min-w-0"
                onClick={() => setResumeOpen(true)}
              >
                <Play className="size-3.5" aria-hidden />
                Resume
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                className="jacita-press h-11 min-w-[7.5rem] cursor-pointer border-amber-600/35 text-amber-950 hover:bg-amber-50 sm:h-9 sm:min-w-0"
                onClick={() => setPauseOpen(true)}
              >
                <Pause className="size-3.5" aria-hidden />
                Pause
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="jacita-press h-11 cursor-pointer text-red-800 hover:bg-red-50 hover:text-red-900 sm:h-9"
              onClick={() => setStopOpen(true)}
            >
              <Square className="size-3.5" aria-hidden />
              Emergency stop
            </Button>
          </div>
        </div>
      </div>

{/* Dialogs */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause AI marketing?</DialogTitle>
            <DialogDescription>
              AI will stop generating, scheduling and publishing new automated
              content. Existing content, analytics, strategy, media, and social
              connections stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await pauseAutomation(orgId);
                  setPauseOpen(false);
                  if ("error" in res && res.error) toast.error(res.error);
                  else {
                    toast.message("Automation paused");
                    router.refresh();
                  }
                })
              }
            >
              Pause automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume AI marketing?</DialogTitle>
            <DialogDescription>
              AI will analyse the current state of {businessName} and continue
              the marketing loop. Stale tasks are not blindly resumed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResumeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await resumeAutomation(orgId);
                  setResumeOpen(false);
                  if ("error" in res && res.error) toast.error(res.error);
                  else {
                    toast.success("Automation resumed");
                    router.refresh();
                  }
                })
              }
            >
              Resume automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(modeOpen)} onOpenChange={() => setModeOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Switch to {modeOpen ? MODE_COPY[modeOpen as keyof typeof MODE_COPY]?.title || modeOpen : ""}?
            </DialogTitle>
            <DialogDescription>
              {modeOpen === "autopilot"
                ? "AI will automatically create, schedule and publish organic social content according to your settings."
                : modeOpen === "approval"
                  ? "AI will prepare content. Nothing publishes until you approve."
                  : "AI will recommend only. You control creation and publishing."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeOpen(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !modeOpen}
              onClick={() =>
                startTransition(async () => {
                  if (!modeOpen) return;
                  const res = await changeAutomationMode({
                    organisationId: orgId,
                    mode: modeOpen,
                    confirmed: true,
                  });
                  setModeOpen(null);
                  if ("error" in res && res.error) toast.error(res.error);
                  else {
                    toast.success(`Mode set to ${modeOpen}`);
                    router.refresh();
                  }
                })
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop all automated marketing activity?</DialogTitle>
            <DialogDescription>
              Nothing will be deleted. Generation, scheduling, and publishing
              stop. Pending automation tasks and publish jobs are cancelled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await emergencyStopAutomation(orgId);
                  setStopOpen(false);
                  if ("error" in res && res.error) toast.error(res.error);
                  else {
                    toast.message("All automation stopped");
                    router.refresh();
                  }
                })
              }
            >
              Stop all automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={() => setPreviewId(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          {previewItem ? (
            <SocialPreview
              platform={previewItem.platforms[0] || "instagram"}
              businessName={businessName}
              caption={previewItem.caption || undefined}
              hook={previewItem.hook || undefined}
              hashtags={previewItem.hashtags}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCell({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  return (
    <div className="bg-card px-3.5 py-3.5 sm:px-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-heading text-xl font-semibold leading-none tracking-tight tabular-nums",
          tone === "ok" && "text-emerald-700",
          tone === "warn" && "text-amber-800",
          tone === "bad" && "text-red-700"
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
