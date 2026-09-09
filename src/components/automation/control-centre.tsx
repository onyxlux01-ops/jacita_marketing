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
import { SocialPreview } from "@/components/content/social-preview";
import { PlatformPill } from "@/components/content/platform-icons";
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
  if (isToday(d)) return `Today · ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "HH:mm")}`;
  return format(d, "EEE d MMM · HH:mm");
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

  // Realtime — refresh when this business changes
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

  const scheduleBuckets = useMemo(() => {
    const today: UpcomingContentItem[] = [];
    const tomorrow: UpcomingContentItem[] = [];
    const week: UpcomingContentItem[] = [];
    const start = startOfDay(new Date());
    const endTomorrow = addDays(start, 2);
    const endWeek = addDays(start, 7);
    for (const item of upcoming.filter((u) => u.status === "scheduled")) {
      const t = new Date(item.scheduled_at || item.suggested_posting_time || 0);
      if (isToday(t)) today.push(item);
      else if (isTomorrow(t)) tomorrow.push(item);
      else if (t >= endTomorrow && t < endWeek) week.push(item);
    }
    return { today, tomorrow, week };
  }, [upcoming]);

  return (
    <div className="space-y-10 lg:space-y-12">
      {/* Hero status */}
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-5 py-6 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(15,118,110,0.06),transparent_55%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="jacita-label">AI marketing</p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex size-2.5 shrink-0 rounded-full",
                  status.hero.tone === "active" &&
                    "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)] animate-pulse",
                  status.hero.tone === "paused" && "bg-amber-500",
                  status.hero.tone === "off" && "bg-muted-foreground/40"
                )}
                aria-hidden
              />
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {status.hero.title}
              </h2>
            </div>
            <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
              {status.hero.subtitle}
            </p>

            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Currently</dt>
                <dd className="mt-1 text-sm font-medium leading-snug">
                  {activity.label}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Next</dt>
                <dd className="mt-1 text-sm font-medium leading-snug">
                  {status.nextLabel}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Scheduled</dt>
                <dd className="mt-1 font-heading text-xl font-semibold">
                  {status.scheduledCount}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    posts
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Published</dt>
                <dd className="mt-1 font-heading text-xl font-semibold">
                  {status.publishedThisWeek}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    this week
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
            {status.paused || !status.active ? (
              <Button
                size="lg"
                className="w-full"
                disabled={pending}
                onClick={() => setResumeOpen(true)}
              >
                Resume automation
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                className="w-full border-amber-600/40 text-amber-900 hover:bg-amber-50"
                disabled={pending}
                onClick={() => setPauseOpen(true)}
              >
                Pause automation
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || status.mode === "off"}
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
              Run cycle now
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Health ·{" "}
              <span
                className={cn(
                  "font-medium",
                  health.status === "healthy" && "text-emerald-700",
                  health.status === "attention" && "text-amber-700",
                  health.status === "critical" && "text-red-700"
                )}
              >
                {health.label}
              </span>
            </p>
          </div>
        </div>
      </section>

      {showEmptySetup ? (
        <section className="rounded-2xl border border-dashed border-border px-5 py-8 text-center sm:px-8">
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

      {/* AI working on + decision */}
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">AI is working on</h3>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-4">
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
                        ? "✓"
                        : q.status === "active"
                          ? "…"
                          : q.status === "failed"
                            ? "!"
                            : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">AI decision</h3>
          {status.decision ? (
            <div className="rounded-xl border border-border/70 bg-card px-4 py-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Decision</p>
                <p className="mt-1 text-[15px] font-medium">
                  {status.decision.decision}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Why?</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">
                  {status.decision.why}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Action</p>
                <p className="mt-1 text-sm font-medium">{status.decision.action}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Decisions appear after AI reviews performance for {businessName}.
            </p>
          )}
        </section>
      </div>

      {/* Needs attention */}
      <section className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">Needs your attention</h3>
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
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.detail}
                  </p>
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

      {/* Approval queue */}
      {status.mode === "approval" || approvals.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">
            Waiting for approval
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
                  className="rounded-xl border border-border/70 bg-card p-3"
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
                            toast.success("Approved — queued to publish");
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
                            toast.message("Rejected — AI will learn");
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

      {/* Coming up */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h3 className="font-heading text-lg font-semibold">Coming up</h3>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming posts yet. Start or resume automation to fill the pipeline.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {upcoming.slice(0, 10).map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
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
                      · {item.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">
                    {item.hook || item.title || "Untitled"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {whenLabel(item.scheduled_at || item.suggested_posting_time)}
                    {item.service_name ? ` · ${item.service_name}` : ""}
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
                          toast.message("Skipped — will not publish");
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

      {/* Schedule strip */}
      <section className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Schedule</h3>
        <div className="grid gap-6 sm:grid-cols-3">
          {(
            [
              ["Today", scheduleBuckets.today],
              ["Tomorrow", scheduleBuckets.tomorrow],
              ["This week", scheduleBuckets.week],
            ] as const
          ).map(([label, items]) => (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.slice(0, 4).map((item) => (
                    <li key={item.id} className="text-sm">
                      <Link
                        href={`/app/content/${item.id}`}
                        className="hover:text-primary"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.scheduled_at
                            ? format(new Date(item.scheduled_at), "HH:mm")
                            : "--:--"}
                        </span>{" "}
                        <span className="capitalize">
                          {item.platforms[0] || "post"}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {item.hook || item.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Published + learned */}
      <div className="grid gap-10 lg:grid-cols-2">
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
                        · Published ✓
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
          <ol className="relative space-y-0 border-l border-border/80 ml-1.5">
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
                  "rounded-xl border px-4 py-3 text-left transition-colors",
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
      <section className="space-y-6 rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div>
          <h3 className="font-heading text-lg font-semibold">
            Automation settings
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Preferences and constraints. AI optimises within these rules —
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
                  "rounded-full border px-3 py-1.5 text-xs",
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
                  "rounded-full border px-3 py-1.5 text-xs capitalize",
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
                  "rounded-full border px-3 py-1.5 text-xs",
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
                  "rounded-xl border px-3 py-2.5 text-left",
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
          <Button
            variant="outline"
            className="border-red-300 text-red-800 hover:bg-red-50"
            disabled={pending}
            onClick={() => setStopOpen(true)}
          >
            Stop all automation
          </Button>
        </div>
      </section>

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
