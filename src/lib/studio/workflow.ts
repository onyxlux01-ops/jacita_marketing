import { isValidTransition } from "./stations";
import type {
  StationId,
  StationState,
  StudioContentItem,
  StudioEvent,
  StudioSnapshot,
} from "./types";

/** Which station represents each automation task type. */
export const TASK_STATION: Record<string, StationId> = {
  strategy_update: "brief",
  pipeline_check: "brief",
  media_selection: "brief",
  content_generation: "content",
  content_validation: "review",
  schedule_post: "publishing",
  publish_post: "publishing",
  performance_analysis: "analytics",
};

export const TASK_LABELS: Record<string, string> = {
  performance_analysis: "Analysing performance",
  strategy_update: "Updating strategy",
  content_generation: "Generating content",
  media_selection: "Selecting media",
  content_validation: "Validating content",
  schedule_post: "Scheduling posts",
  publish_post: "Publishing content",
  pipeline_check: "Checking content pipeline",
};

const DAY = 86_400_000;

function latest(...dates: Array<string | null | undefined>) {
  let best: string | null = null;
  for (const d of dates)
    if (d && (!best || new Date(d).getTime() > new Date(best).getTime()))
      best = d;
  return best;
}

export function formatInstant(iso: string, timeZone: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(iso).toLocaleString("en-GB");
  }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

function itemsWith(snapshot: StudioSnapshot, ...statuses: string[]) {
  return snapshot.content.filter((c) => statuses.includes(c.status));
}

function contentHref(snapshot: StudioSnapshot, item?: StudioContentItem) {
  return item && !snapshot.demo ? `/app/content/${item.id}` : null;
}

/**
 * Map one backend snapshot to the five station states. Pure: the same snapshot
 * always produces the same states, which keeps the scene a faithful picture of
 * stored records rather than a source of truth of its own.
 */
export function deriveStations(
  snapshot: StudioSnapshot,
  now = Date.now(),
): Record<StationId, StationState> {
  const { counts, setup, publishing, analytics } = snapshot;
  const tasksFor = (station: StationId) =>
    snapshot.tasks.filter((t) => TASK_STATION[t.type] === station);
  const running = (station: StationId) =>
    tasksFor(station).find((t) => t.status === "running");

  // 1 · Client brief
  const briefTasks = tasksFor("brief");
  const briefRunning = running("brief");
  const missing = [
    !setup.hasLogo && "brand logo",
    setup.mediaCount === 0 && "media",
  ].filter(Boolean) as string[];
  const brief: StationState = {
    id: "brief",
    mood: briefRunning ? "working" : missing.length ? "blocked" : briefTasks.length || setup.activeCampaigns.length ? "working" : "idle",
    statusLabel: briefRunning
      ? (TASK_LABELS[briefRunning.type] ?? "Preparing brief")
      : missing.length
        ? `Missing ${missing.join(" & ")}`
        : setup.activeCampaigns.length
          ? "Briefing active campaigns"
          : "Brand board ready",
    queue: briefTasks.length,
    queueLabel: `${plural(briefTasks.length, "planning task")} queued`,
    taskTitle: setup.activeCampaigns[0]
      ? `Campaign · ${setup.activeCampaigns[0]}`
      : briefRunning
        ? (TASK_LABELS[briefRunning.type] ?? null)
        : null,
    taskHref: setup.activeCampaigns.length && !snapshot.demo ? "/app/campaigns" : null,
    lastUpdate: latest(...briefTasks.map((t) => t.createdAt)),
    detail: missing.length
      ? `Briefs need a ${missing.join(" and ")} before the studio can work from them.`
      : `${plural(setup.mediaCount, "active media asset")} · ${plural(setup.activeCampaigns.length, "active campaign")}.`,
    actions: [
      { label: "Brand & assets", href: "/app/settings?section=brand" },
      { label: "Media library", href: "/app/media" },
      { label: "Campaigns", href: "/app/campaigns" },
    ],
  };

  // 2 · AI content studio
  const drafts = itemsWith(snapshot, "draft");
  const contentRunning = running("content");
  const content: StationState = {
    id: "content",
    mood: contentRunning || counts.draft > 0 ? "working" : "idle",
    statusLabel: contentRunning
      ? (TASK_LABELS[contentRunning.type] ?? "Generating")
      : counts.draft > 0
        ? "Drafts in progress"
        : "No drafts in progress",
    queue: counts.draft,
    queueLabel: plural(counts.draft, "draft"),
    taskTitle: drafts[0]?.title ?? null,
    taskHref: contentHref(snapshot, drafts[0]),
    lastUpdate: latest(drafts[0]?.updatedAt, contentRunning?.createdAt),
    detail:
      counts.draft > 0
        ? "Drafts stay here until they are sent to review."
        : "Create content to start a new draft package.",
    actions: [
      { label: "Open drafts", href: "/app/content?status=draft" },
      { label: "Create content", href: "/app/content/new" },
    ],
  };

  // 3 · Review desk — "waiting" means waiting on a person, not on the agent.
  const inReview = itemsWith(snapshot, "review");
  const oldestReview = [...inReview].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  )[0];
  const reviewRunning = running("review");
  const overdue = oldestReview
    ? now - new Date(oldestReview.updatedAt).getTime() > 7 * DAY
    : false;
  const review: StationState = {
    id: "review",
    mood: counts.review > 0 ? "waiting" : reviewRunning ? "working" : "idle",
    statusLabel:
      counts.review > 0
        ? overdue
          ? "Awaiting your approval · overdue"
          : "Awaiting your approval"
        : reviewRunning
          ? "Checking drafts"
          : "Nothing awaiting approval",
    queue: counts.review,
    queueLabel: `${plural(counts.review, "draft")} to review`,
    taskTitle: oldestReview?.title ?? null,
    taskHref: contentHref(snapshot, oldestReview),
    lastUpdate: latest(...inReview.map((i) => i.updatedAt), reviewRunning?.createdAt),
    detail:
      "Approving sends work to publishing; requesting changes returns it to the studio. Nothing is approved automatically by this view.",
    actions: [{ label: "Open approval queue", href: "/app/content?status=review" }],
  };

  // 4 · Publishing — success only from provider confirmations.
  const pubRunning = running("publishing");
  const failed = counts.failed;
  const issues = setup.connectionIssues + (setup.accounts === 0 ? 1 : 0);
  const recentConfirmed = publishing.confirmed.filter(
    (p) => now - new Date(p.publishedAt).getTime() < DAY,
  );
  const queued = counts.approved + counts.scheduled + counts.publishing;
  const failedItem = itemsWith(snapshot, "failed")[0];
  const publishingItem =
    itemsWith(snapshot, "publishing")[0] ??
    [...itemsWith(snapshot, "scheduled")].sort(
      (a, b) =>
        new Date(a.scheduledAt ?? a.updatedAt).getTime() -
        new Date(b.scheduledAt ?? b.updatedAt).getTime(),
    )[0] ??
    itemsWith(snapshot, "approved")[0];
  let pubMood: StationState["mood"] = "idle";
  let pubLabel = "Nothing queued";
  if (failed > 0 || publishing.held > 0) {
    pubMood = "blocked";
    pubLabel =
      failed > 0
        ? `${plural(failed, "publication")} failed`
        : `${plural(publishing.held, "post")} held for re-approval`;
  } else if (counts.publishing > 0 || pubRunning) {
    pubMood = "working";
    pubLabel = "Dispatching · awaiting provider confirmation";
  } else if (issues > 0 && queued > 0) {
    pubMood = "blocked";
    pubLabel = setup.accounts === 0 ? "No publishing account connected" : "Account connection needs attention";
  } else if (counts.scheduled > 0) {
    pubMood = "scheduled";
    pubLabel = "Scheduled · not yet published";
  } else if (counts.approved > 0) {
    pubMood = "waiting";
    pubLabel = "Approved · not yet scheduled";
  } else if (recentConfirmed.length) {
    pubMood = "done";
    pubLabel = "Publication confirmed by provider";
  }
  const publishingState: StationState = {
    id: "publishing",
    mood: pubMood,
    statusLabel: pubLabel,
    queue: queued,
    queueLabel: `${plural(counts.scheduled, "scheduled post")} · ${counts.approved} approved`,
    taskTitle: (failedItem ?? publishingItem)?.title ?? null,
    taskHref: contentHref(snapshot, failedItem ?? publishingItem),
    lastUpdate: latest(
      failedItem?.updatedAt,
      publishingItem?.updatedAt,
      publishing.confirmed[0]?.publishedAt,
    ),
    detail: publishing.nextScheduledAt
      ? `Next post is due ${formatInstant(publishing.nextScheduledAt, snapshot.timezone)}. It stays scheduled until publishing starts.`
      : "Scheduled posts stay scheduled until their publishing time. Only provider confirmations count as published.",
    actions: [
      { label: "Calendar", href: "/app/calendar" },
      { label: "Scheduled posts", href: "/app/content?status=scheduled" },
      ...(failed > 0
        ? [{ label: "Review failures", href: "/app/content?status=failed" }]
        : []),
      { label: "Publishing history", href: "/app/social" },
    ],
  };

  // 5 · Analytics & leads
  const analyticsRunning = running("analytics");
  const fresh =
    analytics.lastUpdatedAt &&
    now - new Date(analytics.lastUpdatedAt).getTime() < 7 * DAY;
  const analyticsState: StationState = {
    id: "analytics",
    mood: analytics.enquiries2d > 0
      ? "attention"
      : analyticsRunning || fresh
        ? "working"
        : "idle",
    statusLabel:
      analytics.enquiries2d > 0
        ? `${plural(analytics.enquiries2d, "new enquiry", "new enquiries")} to follow up`
        : analyticsRunning
          ? (TASK_LABELS[analyticsRunning.type] ?? "Analysing")
          : fresh
            ? "Reviewing recent performance"
            : "No performance recorded in 7 days",
    queue: analytics.enquiries7d,
    queueLabel: `${plural(analytics.enquiries7d, "enquiry", "enquiries")} · 7 days`,
    taskTitle: analytics.lastMetricDate
      ? `Performance report · ${analytics.lastMetricDate}`
      : null,
    taskHref: analytics.lastMetricDate && !snapshot.demo ? "/app/analytics" : null,
    lastUpdate: latest(analytics.lastUpdatedAt, analyticsRunning?.createdAt),
    detail: `Reach ${analytics.reach7d.toLocaleString("en-GB")} over 7 days, from recorded metrics. Enquiries are counted from analytics records.`,
    actions: [
      { label: "Analytics", href: "/app/analytics" },
      { label: "Campaigns", href: "/app/campaigns" },
    ],
  };

  return {
    brief,
    content,
    review,
    publishing: publishingState,
    analytics: analyticsState,
  };
}

/** Station states for when no records could be read: idle, and explicitly unknown. */
export function unavailableStations(
  actions: Record<StationId, StationState["actions"]> | null = null,
): Record<StationId, StationState> {
  const ids: StationId[] = ["brief", "content", "review", "publishing", "analytics"];
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        mood: "idle",
        statusLabel: "Live data unavailable",
        queue: 0,
        queueLabel: "Queue unknown",
        taskTitle: null,
        taskHref: null,
        lastUpdate: null,
        detail: "No business records could be read, so nothing is shown as in progress.",
        actions: actions?.[id] ?? [],
        unknown: true,
      } satisfies StationState,
    ]),
  ) as Record<StationId, StationState>;
}

/**
 * Compare two snapshots of the same business and describe each workflow move as
 * an event. The first snapshot is always a baseline (no events), so mounting,
 * remounting or re-rendering never replays history.
 */
export function deriveEvents(
  prev: StudioSnapshot | null,
  next: StudioSnapshot,
): StudioEvent[] {
  if (!prev || prev.organisationId !== next.organisationId || prev.demo !== next.demo)
    return [];
  const before = new Map(prev.content.map((c) => [c.id, c]));
  const events: StudioEvent[] = [];
  const add = (
    item: StudioContentItem,
    kind: StudioEvent["kind"],
    from: StationId,
    to: StationId,
    suffix = "",
    previous = "new",
  ) => {
    if (from !== to && !isValidTransition(from, to)) return;
    events.push({
      key: `${item.id}:${previous}>${item.status}:${item.updatedAt}${suffix}`,
      kind,
      from,
      to,
      contentId: item.id,
      title: item.title,
      at: item.updatedAt,
    });
  };
  const since = new Date(prev.fetchedAt).getTime();
  for (const item of next.content) {
    const old = before.get(item.id);
    if (!old) {
      if (new Date(item.updatedAt).getTime() <= since) continue; // scrolled into the window
      if (item.status === "draft") add(item, "handover", "brief", "content");
      else if (item.status === "review") add(item, "handover", "content", "review");
      continue;
    }
    if (old.status === item.status) continue;
    const s = old.status;
    const t = item.status;
    if (s === "draft" && t === "review") add(item, "handover", "content", "review", "", s);
    else if (s === "review" && t === "draft") add(item, "revision", "review", "content", "", s);
    else if (s === "review" && ["approved", "scheduled", "publishing"].includes(t))
      add(item, "handover", "review", "publishing", "", s);
    else if (s === "draft" && ["approved", "scheduled"].includes(t)) {
      add(item, "handover", "content", "review", "#1", s);
      add(item, "handover", "review", "publishing", "#2", s);
    } else if (t === "scheduled") add(item, "scheduled", "publishing", "publishing", "", s);
    else if (t === "failed") add(item, "failed", "publishing", "publishing", "", s);
  }
  // Completion comes only from provider confirmations, never from a status alone.
  const seen = new Set(prev.publishing.confirmed.map((p) => p.id));
  const completed = new Set<string>();
  for (const pub of next.publishing.confirmed) {
    if (seen.has(pub.id) || completed.has(pub.contentId)) continue;
    completed.add(pub.contentId);
    const item = next.content.find((c) => c.id === pub.contentId);
    events.push({
      key: `publication:${pub.id}`,
      kind: "complete",
      from: "publishing",
      to: "analytics",
      contentId: pub.contentId,
      title: item?.title ?? "Published post",
      at: pub.publishedAt,
    });
  }
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
