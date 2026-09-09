import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import { PlatformIcons } from "@/components/content/platform-icons";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { Button } from "@/components/ui/button";
import {
  getActiveOrganisation,
  getSessionUser,
  getUserOrganisations,
} from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { ensureAutomationSettings } from "@/lib/automation";
import type { ContentStatus, SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

type ContentPreview = {
  id: string;
  title: string | null;
  status: ContentStatus;
  scheduled_at: string | null;
  caption: string | null;
  hook: string | null;
  content_type: string | null;
  platforms: SocialPlatform[];
};

function contentTypeLabel(type: string | null) {
  if (!type) return "Post";
  return type.replaceAll("_", " ");
}

function thumbTone(index: number) {
  const tones = [
    "from-[#d7e4e1] via-[#eef2f1] to-[#c5d4d0]",
    "from-[#e2e0d8] via-[#f3f1eb] to-[#d0cdc4]",
    "from-[#d9e0e8] via-[#eef1f5] to-[#c8d0db]",
  ];
  return tones[index % tones.length];
}

export default async function DashboardPage() {
  const [orgs, user] = await Promise.all([
    getUserOrganisations(),
    getSessionUser(),
  ]);
  const active = await getActiveOrganisation(orgs);
  const orgId = active?.id ?? null;

  let settings = null as Awaited<
    ReturnType<typeof ensureAutomationSettings>
  > | null;
  let activity: Array<{
    id: string;
    message: string;
    severity: string;
    event_type: string;
    created_at: string;
  }> = [];
  let upcoming: ContentPreview[] = [];
  let attention: ContentPreview[] = [];
  let learned: string[] = [];
  let counts = { scheduled: 0, publishedWeek: 0, review: 0 };
  let setupProgress = null as Awaited<
    ReturnType<typeof import("@/lib/org/setup-progress").getSetupProgress>
  >;

  if (orgId && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const admin = createAdminClient();
      settings = await ensureAutomationSettings(admin, orgId);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [
        { data: content },
        { data: act },
        { data: insights },
        progress,
      ] = await Promise.all([
        supabase
          .from("content")
          .select(
            "id, title, status, scheduled_at, caption, hook, content_type, published_at, content_platforms(platform)"
          )
          .eq("organisation_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(40),
        supabase
          .from("automation_activity")
          .select("id, message, severity, event_type, created_at")
          .eq("organisation_id", orgId)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("automation_activity")
          .select("message")
          .eq("organisation_id", orgId)
          .eq("event_type", "learning")
          .order("created_at", { ascending: false })
          .limit(3),
        (async () => {
          const { getSetupProgress } = await import("@/lib/org/setup-progress");
          return getSetupProgress(supabase, orgId);
        })(),
      ]);

      setupProgress = progress;
      activity = act ?? [];
      learned = (insights ?? []).map((i) => i.message);

      const rows = (content ?? []).map((row) => {
        const platformsRaw = (
          row as {
            content_platforms?: Array<{ platform: SocialPlatform }> | null;
          }
        ).content_platforms;
        return {
          id: row.id,
          title: row.title,
          status: row.status as ContentStatus,
          scheduled_at: row.scheduled_at,
          caption: row.caption,
          hook: row.hook,
          content_type: row.content_type,
          published_at: row.published_at as string | null,
          platforms: (platformsRaw ?? []).map((p) => p.platform),
        };
      });

      upcoming = rows
        .filter((r) =>
          ["scheduled", "approved", "review"].includes(r.status)
        )
        .sort((a, b) => {
          const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
          const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
          return ta - tb;
        })
        .slice(0, 6);

      attention = rows.filter((r) =>
        ["review", "failed"].includes(r.status)
      ).slice(0, 5);

      counts = {
        scheduled: rows.filter((r) => r.status === "scheduled").length,
        review: rows.filter((r) => r.status === "review").length,
        publishedWeek: rows.filter((r) => {
          if (r.status !== "published") return false;
          const t = r.published_at ? new Date(r.published_at) : null;
          return t ? t >= weekAgo : false;
        }).length,
      };
    } catch {
      // keep defaults
    }
  }

  const firstName = user?.full_name?.split(" ")[0];
  const businessLabel = active?.name ?? "your business";
  const categoryLine = [active?.business_category, active?.location]
    .filter(Boolean)
    .join(" · ");

  const automationOn =
    settings?.enabled && settings.mode !== "off" && !settings.paused;
  const nextPost = upcoming.find((u) => u.scheduled_at) || upcoming[0] || null;
  const workingOn =
    settings?.state_message ||
    (automationOn
      ? "Monitoring pipeline and preparing content"
      : "Automation is off — start it to let AI manage marketing");

  return (
    <div className="jacita-page jacita-enter max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="hidden lg:block">
            <BusinessSwitcher
              organisations={orgs}
              active={active}
              variant="page"
            />
          </div>
          <div className="lg:hidden">
            <p className="font-heading text-xl font-semibold tracking-tight">
              {active?.name ?? "No business"}
            </p>
            {categoryLine ? (
              <p className="mt-1 text-sm text-muted-foreground">{categoryLine}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/app/automation">Automation</Link>
          </Button>
          <Button asChild className="rounded-lg">
            <Link href="/app/content/new">Create content</Link>
          </Button>
        </div>
      </header>

      <section className="jacita-enter jacita-enter-delay-1 pt-1">
        <h1 className="font-heading text-[1.5rem] font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
          {firstName ? `${firstName}, ` : ""}
          {automationOn ? "AI is managing marketing." : "Automation is waiting."}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Command centre for {businessLabel} — organic social automation only.
        </p>
      </section>

      {setupProgress && !setupProgress.completed ? (
        <SetupChecklist progress={setupProgress} />
      ) : null}

      {/* Automation status — primary */}
      <section className="jacita-panel jacita-enter jacita-enter-delay-1 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="jacita-label">Automation</p>
            <p className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              {settings?.paused
                ? "PAUSED"
                : automationOn
                  ? `${(settings?.mode || "approval").toUpperCase()} ACTIVE`
                  : "OFF"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings?.paused
                ? "New automated actions are stopped until you resume."
                : automationOn
                  ? "AI is currently managing your social media."
                  : "Turn on Approval or Autopilot to start the marketing loop."}
            </p>
          </div>
          <Button asChild>
            <Link
              href={
                settings?.setup_completed_at
                  ? "/app/automation"
                  : "/app/automation/setup"
              }
            >
              {automationOn ? "Manage" : "Set up automation"}
            </Link>
          </Button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Next post</dt>
            <dd className="mt-1 truncate text-sm font-medium">
              {nextPost?.title || nextPost?.hook || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Next platform</dt>
            <dd className="mt-1 text-sm font-medium capitalize">
              {nextPost?.platforms[0] || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Scheduled</dt>
            <dd className="mt-1 font-heading text-lg font-semibold">
              {counts.scheduled}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Published (7d)</dt>
            <dd className="mt-1 font-heading text-lg font-semibold">
              {counts.publishedWeek}
            </dd>
          </div>
        </dl>
      </section>

      <section className="jacita-enter jacita-enter-delay-2 space-y-2">
        <h2 className="font-heading text-lg font-semibold">AI is working on</h2>
        <p className="text-[15px] text-foreground/90">{workingOn}</p>
        {settings?.current_state ? (
          <p className="text-xs capitalize text-muted-foreground">
            State: {settings.paused ? "paused" : settings.current_state}
          </p>
        ) : null}
      </section>

      <div className="jacita-enter jacita-enter-delay-2 grid gap-10 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold">Upcoming</h2>
            <Link
              href="/app/calendar"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Calendar
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming posts. Start automation to fill the pipeline.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {upcoming.slice(0, 4).map((item, index) => (
                <li key={item.id}>
                  <Link
                    href={`/app/content/${item.id}`}
                    className="group flex gap-3 overflow-hidden rounded-xl bg-card p-2 transition-transform hover:-translate-y-0.5"
                    style={{
                      boxShadow:
                        "0 1px 2px rgba(15,18,24,0.04), 0 8px 24px rgba(15,18,24,0.04)",
                    }}
                  >
                    <div
                      className={cn(
                        "relative size-16 shrink-0 rounded-lg bg-gradient-to-br",
                        thumbTone(index)
                      )}
                    >
                      <div className="absolute inset-1">
                        <PlatformIcons platforms={item.platforms} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} className="scale-90" />
                        <span className="text-[11px] capitalize text-muted-foreground">
                          {contentTypeLabel(item.content_type)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">
                        {item.hook || item.title || "Untitled"}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {item.scheduled_at
                          ? format(
                              new Date(item.scheduled_at),
                              "EEE d MMM · HH:mm"
                            )
                          : "Awaiting schedule"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-heading text-lg font-semibold">AI learned</h2>
          {learned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Insights appear after automation analyses performance for this
              business.
            </p>
          ) : (
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {learned.map((text) => (
                <li key={text} className="py-3 text-[15px] leading-relaxed">
                  {text}
                </li>
              ))}
            </ul>
          )}

          <h2 className="pt-4 font-heading text-lg font-semibold">
            Needs your attention
          </h2>
          {attention.length === 0 && counts.review === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing needs you right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/app/content/${item.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="truncate">
                      {item.title || item.hook || "Content"}
                    </span>
                    <span className="shrink-0 capitalize text-xs text-amber-700">
                      {item.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="jacita-enter jacita-enter-delay-3 space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-heading text-lg font-semibold">
            Today&apos;s activity
          </h2>
          <Link
            href="/app/automation"
            className="text-sm font-medium text-primary hover:underline"
          >
            Full feed
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Automation activity for {businessLabel} will show here.
          </p>
        ) : (
          <ul className="border-t border-border/70">
            {activity.map((row) => (
              <li
                key={row.id}
                className="flex gap-3 border-b border-border/70 py-3 text-sm"
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    row.severity === "error"
                      ? "bg-red-500"
                      : row.severity === "warning"
                        ? "bg-amber-500"
                        : row.severity === "success"
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/40"
                  )}
                />
                <div>
                  <p>{row.message}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {format(new Date(row.created_at), "HH:mm")} · {row.event_type}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
