import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureAutomationSettings,
  type AutomationMode,
  type AutomationSettings,
  type AutomationState,
} from "@/lib/automation/settings";
import type { SocialPlatform } from "@/lib/types";
import type { Json } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Admin = ReturnType<typeof createAdminClient>;

export type AiFreedomLevel = "conservative" | "balanced" | "aggressive";

export type AutomationHealthStatus = "healthy" | "attention" | "critical" | "off";

export type AttentionItem = {
  id: string;
  kind:
    | "approval"
    | "media"
    | "social"
    | "publish_failed"
    | "automation_error"
    | "setup";
  title: string;
  detail: string;
  href?: string;
  contentId?: string;
};

export type UpcomingContentItem = {
  id: string;
  title: string | null;
  hook: string | null;
  caption: string | null;
  call_to_action: string | null;
  hashtags: string[];
  content_type: string | null;
  status: string;
  scheduled_at: string | null;
  suggested_posting_time: string | null;
  platforms: SocialPlatform[];
  service_name: string | null;
  media_url: string | null;
  skipped: boolean;
};

export type AiDecision = {
  decision: string;
  why: string;
  action: string;
  confidence?: string | null;
};

export type WorkQueueItem = {
  key: string;
  label: string;
  status: "done" | "active" | "pending" | "failed";
};

function isSkippedPayload(payload: Json | null | undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  return Boolean((payload as Record<string, unknown>).skipped);
}

function stateLabel(state: AutomationState | string, paused: boolean) {
  if (paused) return "Paused";
  const map: Record<string, string> = {
    off: "Idle",
    starting: "Starting up",
    analysing: "Analysing recent content performance",
    planning: "Planning this week's content",
    creating: "Generating content",
    validating: "Validating content",
    scheduling: "Scheduling posts",
    publishing: "Publishing content",
    learning: "Analysing performance",
    paused: "Paused",
    error: "Needs attention",
    completed: "Standing by",
  };
  return map[state] || "Working";
}

function nextFromState(state: AutomationState | string, mode: AutomationMode) {
  if (mode === "off") return "Start automation to begin";
  const map: Record<string, string> = {
    analysing: "Updating strategy from what worked",
    learning: "Updating strategy from what worked",
    planning: "Creating this week's content",
    creating: "Selecting media and validating",
    validating: "Scheduling approved posts",
    scheduling: "Publishing when due",
    publishing: "Collecting performance",
    completed: "Monitoring pipeline and schedule",
    starting: "Reading business context",
    error: "Fix the issue, then resume",
    paused: "Resume when you are ready",
    off: "Turn automation on",
  };
  return map[state] || "Keeping your marketing pipeline filled";
}

export async function getAutomationStatus(
  supabase: Supabase | Admin,
  organisationId: string
) {
  const adminLike = supabase as Admin;
  const settings = await ensureAutomationSettings(adminLike, organisationId);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [{ count: scheduled }, { count: publishedWeek }] = await Promise.all([
    supabase
      .from("content")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "scheduled"),
    supabase
      .from("content")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "published")
      .gte("published_at", weekAgo.toISOString()),
  ]);

  const mode = settings.mode as AutomationMode;
  const active =
    settings.enabled && mode !== "off" && !settings.paused;
  const latest = (settings as AutomationSettings & {
    latest_decision?: Json;
    next_planned_action?: string | null;
    ai_freedom_level?: AiFreedomLevel;
  }).latest_decision;

  let decision: AiDecision | null = null;
  if (latest && typeof latest === "object" && !Array.isArray(latest)) {
    const d = latest as Record<string, unknown>;
    if (typeof d.decision === "string" && d.decision) {
      decision = {
        decision: d.decision,
        why: String(d.why || ""),
        action: String(d.action || ""),
        confidence:
          typeof d.confidence === "string" ? d.confidence : null,
      };
    }
  }

  return {
    organisationId,
    enabled: settings.enabled,
    paused: settings.paused,
    mode,
    currentState: settings.current_state as AutomationState,
    stateMessage: settings.state_message,
    currentlyLabel: stateLabel(settings.current_state, settings.paused),
    nextLabel:
      (settings as { next_planned_action?: string | null }).next_planned_action ||
      nextFromState(settings.current_state, mode),
    scheduledCount: scheduled ?? 0,
    publishedThisWeek: publishedWeek ?? 0,
    active,
    setupCompletedAt: settings.setup_completed_at,
    lastRunAt: settings.last_run_at,
    lastError: settings.last_error,
    freedomLevel:
      ((settings as { ai_freedom_level?: AiFreedomLevel }).ai_freedom_level as
        | AiFreedomLevel
        | undefined) || "balanced",
    postsPerWeek: settings.posts_per_week,
    storiesPerWeek: settings.stories_per_week,
    reelsPerWeek: settings.reels_per_week,
    platforms: settings.platforms,
    contentPreferences: settings.content_preferences,
    primaryGoals: settings.primary_goals,
    decision,
    hero: active
      ? {
          tone: "active" as const,
          title: `${mode.toUpperCase()} ACTIVE`,
          subtitle:
            mode === "autopilot"
              ? "Your marketing is running automatically."
              : mode === "approval"
                ? "AI prepares content. You approve before publishing."
                : "AI recommends. You control publishing.",
        }
      : settings.paused
        ? {
            tone: "paused" as const,
            title: "AUTOMATION PAUSED",
            subtitle:
              "Automation is paused. Your existing scheduled content remains unchanged.",
          }
        : {
            tone: "off" as const,
            title: "AUTOMATION OFF",
            subtitle: "AI is not currently managing this business.",
          },
  };
}

export async function getCurrentAIActivity(
  supabase: Supabase | Admin,
  organisationId: string
) {
  const { data: settings } = await supabase
    .from("automation_settings")
    .select(
      "current_state, state_message, paused, enabled, mode, latest_decision, next_planned_action"
    )
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const { data: runningTasks } = await supabase
    .from("automation_tasks")
    .select("id, task_type, status, created_at, decision")
    .eq("organisation_id", organisationId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(8);

  const activeTask = (runningTasks ?? []).find((t) => t.status === "running");
  const decision =
    settings?.latest_decision &&
    typeof settings.latest_decision === "object" &&
    !Array.isArray(settings.latest_decision)
      ? (settings.latest_decision as Record<string, unknown>)
      : null;

  const taskLabels: Record<string, string> = {
    performance_analysis: "Analysing performance",
    strategy_update: "Updating strategy",
    content_generation: "Generating content",
    media_selection: "Selecting media",
    content_validation: "Validating content",
    schedule_post: "Scheduling posts",
    publish_post: "Publishing content",
    pipeline_check: "Checking content pipeline",
  };

  return {
    label: settings?.paused
      ? "Paused"
      : activeTask
        ? taskLabels[activeTask.task_type] || activeTask.task_type
        : stateLabel(
            (settings?.current_state as AutomationState) || "off",
            Boolean(settings?.paused)
          ),
    detail: settings?.state_message || null,
    reason:
      typeof decision?.why === "string"
        ? decision.why
        : typeof decision?.decision === "string"
          ? decision.decision
          : null,
    progressNote:
      (runningTasks ?? []).length > 0
        ? `${(runningTasks ?? []).filter((t) => t.status === "completed" || t.status === "running").length} of ${(runningTasks ?? []).length + 1} steps in this cycle`
        : null,
    tasks: runningTasks ?? [],
  };
}

export async function getWorkQueue(
  supabase: Supabase | Admin,
  organisationId: string
): Promise<WorkQueueItem[]> {
  const { data: run } = await supabase
    .from("automation_runs")
    .select("id, status, started_at")
    .eq("organisation_id", organisationId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run || run.status !== "running") return [];

  const { data: tasks } = await supabase
    .from("automation_tasks")
    .select("task_type, status")
    .eq("run_id", run.id)
    .order("created_at", { ascending: true });

  const labels: Record<string, string> = {
    performance_analysis: "Performance analysis",
    strategy_update: "Updating strategy",
    content_generation: "Generating content",
    media_selection: "Selecting media",
    content_validation: "Validating content",
    schedule_post: "Scheduling",
    publish_post: "Publishing",
    pipeline_check: "Pipeline check",
  };

  return (tasks ?? []).map((t) => ({
    key: t.task_type,
    label: labels[t.task_type] || t.task_type,
    status:
      t.status === "completed"
        ? "done"
        : t.status === "running"
          ? "active"
          : t.status === "failed"
            ? "failed"
            : "pending",
  }));
}

export async function getUpcomingContent(
  supabase: Supabase | Admin,
  organisationId: string,
  limit = 8
): Promise<UpcomingContentItem[]> {
  const { data } = await supabase
    .from("content")
    .select(
      `id, title, hook, caption, call_to_action, hashtags, content_type, status,
       scheduled_at, suggested_posting_time, generation_payload, product_service_id,
       products_services ( name ),
       content_platforms ( platform )`
    )
    .eq("organisation_id", organisationId)
    .in("status", ["draft", "review", "approved", "scheduled"])
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(40);

  const rows = (data ?? [])
    .map((row) => {
      const payload = row.generation_payload as Json;
      const skipped = isSkippedPayload(payload);
      if (skipped) return null;
      const platformsRaw = (
        row as {
          content_platforms?: Array<{ platform: SocialPlatform }> | null;
        }
      ).content_platforms;
      const service = (
        row as { products_services?: { name: string } | null }
      ).products_services;
      return {
        id: row.id,
        title: row.title,
        hook: row.hook,
        caption: row.caption,
        call_to_action: row.call_to_action,
        hashtags: (row.hashtags as string[]) || [],
        content_type: row.content_type,
        status: row.status,
        scheduled_at: row.scheduled_at,
        suggested_posting_time: row.suggested_posting_time,
        platforms: (platformsRaw ?? []).map((p) => p.platform),
        service_name: service?.name ?? null,
        media_url: null as string | null,
        skipped: false,
      };
    })
    .filter(Boolean) as UpcomingContentItem[];

  return rows
    .sort((a, b) => {
      const ta = new Date(
        a.scheduled_at || a.suggested_posting_time || 0
      ).getTime();
      const tb = new Date(
        b.scheduled_at || b.suggested_posting_time || 0
      ).getTime();
      return ta - tb;
    })
    .slice(0, limit);
}

export async function getRecentlyPublished(
  supabase: Supabase | Admin,
  organisationId: string,
  limit = 5
) {
  const { data } = await supabase
    .from("content")
    .select(
      "id, title, hook, status, published_at, content_type, content_platforms(platform)"
    )
    .eq("organisation_id", organisationId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const platformsRaw = (
      row as {
        content_platforms?: Array<{ platform: SocialPlatform }> | null;
      }
    ).content_platforms;
    return {
      id: row.id,
      title: row.title,
      hook: row.hook,
      published_at: row.published_at,
      content_type: row.content_type,
      platforms: (platformsRaw ?? []).map((p) => p.platform),
    };
  });
}

export async function getAIInsights(
  supabase: Supabase | Admin,
  organisationId: string
) {
  const [{ data: activity }, { data: insights }] = await Promise.all([
    supabase
      .from("automation_activity")
      .select("id, message, metadata, created_at, severity")
      .eq("organisation_id", organisationId)
      .eq("event_type", "learning")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ai_insights")
      .select(
        "id, insight_text, confidence, action_label, action_href, created_at"
      )
      .eq("organisation_id", organisationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const fromActivity = (activity ?? []).map((a) => {
    const meta =
      a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata)
        ? (a.metadata as Record<string, unknown>)
        : {};
    return {
      id: a.id,
      text: a.message,
      evidence: typeof meta.evidence === "string" ? meta.evidence : null,
      confidence:
        typeof meta.confidence === "string" ? meta.confidence : null,
      changed: typeof meta.changed === "string" ? meta.changed : null,
      created_at: a.created_at,
    };
  });

  const fromInsights = (insights ?? []).map((i) => ({
    id: i.id,
    text: i.insight_text,
    evidence: null as string | null,
    confidence: i.confidence,
    changed: i.action_label,
    created_at: i.created_at,
  }));

  return [...fromActivity, ...fromInsights]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 5);
}

export async function getAutomationTimeline(
  supabase: Supabase | Admin,
  organisationId: string,
  limit = 30
) {
  const { data } = await supabase
    .from("automation_activity")
    .select("id, event_type, message, severity, created_at")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getNeedsAttention(
  supabase: Supabase | Admin,
  organisationId: string
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  const [
    { data: settings },
    { data: social },
    { data: review },
    { data: failed },
    { data: mediaNeeded },
    { data: ambiguousJobs },
  ] = await Promise.all([
    supabase
      .from("automation_settings")
      .select("last_error, current_state, mode, enabled")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("social_accounts")
      .select("platform, connection_status, health_status")
      .eq("organisation_id", organisationId),
    supabase
      .from("content")
      .select("id, title, hook")
      .eq("organisation_id", organisationId)
      .eq("status", "review")
      .limit(8),
    supabase
      .from("content")
      .select("id, title, hook")
      .eq("organisation_id", organisationId)
      .eq("status", "failed")
      .limit(5),
    supabase
      .from("automation_activity")
      .select("id, message, metadata, created_at")
      .eq("organisation_id", organisationId)
      .eq("event_type", "media_required")
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("social_publish_jobs")
      .select("id, content_id, platform, error_message, error_code")
      .eq("organisation_id", organisationId)
      .eq("status", "failed")
      .eq("error_code", "AMBIGUOUS_TIMEOUT")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  for (const s of social ?? []) {
    if (
      s.connection_status === "expired" ||
      s.connection_status === "error" ||
      s.health_status === "reauth_required"
    ) {
      items.push({
        id: `social-${s.platform}`,
        kind: "social",
        title: `${s.platform} connection needs attention`,
        detail:
          s.connection_status === "expired" ||
          s.health_status === "reauth_required"
            ? "Reconnect so AI can keep publishing."
            : "There was an error with this account.",
        href: "/app/social",
      });
    }
  }

  if (settings?.last_error || settings?.current_state === "error") {
    items.push({
      id: "automation-error",
      kind: "automation_error",
      title: "Automation hit a problem",
      detail: settings.last_error || "Open automation to review the last run.",
      href: "/app/automation",
    });
  }

  for (const c of review ?? []) {
    items.push({
      id: `approval-${c.id}`,
      kind: "approval",
      title: "Content requires approval",
      detail: c.title || c.hook || "Review AI-prepared content",
      href: `/app/content/${c.id}`,
      contentId: c.id,
    });
  }

  for (const c of failed ?? []) {
    items.push({
      id: `failed-${c.id}`,
      kind: "publish_failed",
      title: "Publishing failed",
      detail: c.title || c.hook || "A post failed to publish",
      href: `/app/content/${c.id}`,
      contentId: c.id,
    });
  }

  for (const j of ambiguousJobs ?? []) {
    items.push({
      id: `ambiguous-${j.id}`,
      kind: "publish_failed",
      title: `${j.platform} publish needs verification`,
      detail:
        j.error_message ||
        "Timed out before a post ID was returned. Check the platform before retrying.",
      href: j.content_id ? `/app/content/${j.content_id}` : "/app/automation",
      contentId: j.content_id || undefined,
    });
  }

  for (const m of mediaNeeded ?? []) {
    items.push({
      id: `media-${m.id}`,
      kind: "media",
      title: "Media required",
      detail: m.message,
      href: "/app/media",
    });
  }

  if (
    settings?.mode === "autopilot" &&
    settings.enabled &&
    !(social ?? []).some((s) => s.connection_status === "connected")
  ) {
    items.push({
      id: "no-social",
      kind: "setup",
      title: "Connect a social account",
      detail: "Connect Instagram, Facebook, or TikTok before Autopilot can publish.",
      href: "/app/social",
    });
  }

  return items;
}

export async function getAutomationHealth(
  supabase: Supabase | Admin,
  organisationId: string
) {
  const attention = await getNeedsAttention(supabase, organisationId);
  const { data: settings } = await supabase
    .from("automation_settings")
    .select("enabled, mode, paused, setup_completed_at, current_state")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const checks = {
    setup: Boolean(settings?.setup_completed_at),
    config: Boolean(settings && settings.mode !== "off"),
    social: !attention.some((a) => a.kind === "social" || a.id === "no-social"),
    publishing: !attention.some((a) => a.kind === "publish_failed"),
    pipeline: !attention.some((a) => a.kind === "media"),
    errors: !attention.some((a) => a.kind === "automation_error"),
  };

  let status: AutomationHealthStatus = "healthy";
  if (!settings?.enabled || settings.mode === "off") status = "off";
  else if (attention.some((a) => a.kind === "automation_error" || a.kind === "publish_failed")) {
    status = "critical";
  } else if (attention.length > 0) status = "attention";

  return {
    status,
    label:
      status === "healthy"
        ? "Healthy"
        : status === "attention"
          ? "Attention required"
          : status === "critical"
            ? "Action needed"
            : "Off",
    checks,
    attentionCount: attention.length,
  };
}

export async function getApprovalQueue(
  supabase: Supabase | Admin,
  organisationId: string
) {
  return getUpcomingContent(supabase, organisationId, 20).then((items) =>
    items.filter((i) => i.status === "review")
  );
}

export function freedomGuidance(level: AiFreedomLevel) {
  switch (level) {
    case "conservative":
      return "Adapt slowly. Prefer proven formats. Change mix only with strong multi-post evidence.";
    case "aggressive":
      return "Experiment more often within guardrails. Test new formats when performance is soft.";
    default:
      return "Adapt based on clear evidence across multiple posts. Balance proven and experimental content.";
  }
}
