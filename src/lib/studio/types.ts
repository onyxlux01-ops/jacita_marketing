import type { ContentStatus } from "@/lib/types";

/** The five connected workstations, in workflow order. */
export type StationId = "brief" | "content" | "review" | "publishing" | "analytics";

/**
 * What a station's agent is visibly doing. This is derived from backend state;
 * the scene only ever *represents* it and never changes it.
 */
export type StationMood =
  | "idle"
  | "working"
  | "waiting"
  | "scheduled"
  | "blocked"
  | "attention"
  | "done";

export type StudioContentItem = {
  id: string;
  title: string;
  status: ContentStatus;
  updatedAt: string;
  scheduledAt: string | null;
};

export type StudioTask = {
  id: string;
  type: string;
  status: "pending" | "running";
  createdAt: string;
};

export type StudioPublication = {
  id: string;
  contentId: string;
  platform: string;
  publishedAt: string;
};

/**
 * Everything the studio needs, read for exactly one business. `demo` marks
 * simulated snapshots so they can never be mistaken for business records.
 */
export type StudioSnapshot = {
  organisationId: string;
  businessName: string;
  fetchedAt: string;
  demo: boolean;
  timezone: string;
  counts: Record<ContentStatus, number>;
  /** Most recently updated content, newest first (bounded). */
  content: StudioContentItem[];
  tasks: StudioTask[];
  publishing: {
    scheduled: number;
    nextScheduledAt: string | null;
    held: number;
    /** Provider-confirmed, non-simulated publications in the last 7 days. */
    confirmed: StudioPublication[];
  };
  setup: {
    hasLogo: boolean;
    mediaCount: number;
    activeCampaigns: string[];
    connectionIssues: number;
    accounts: number;
  };
  analytics: {
    enquiries7d: number;
    enquiries2d: number;
    reach7d: number;
    lastMetricDate: string | null;
    lastUpdatedAt: string | null;
  };
};

export type StationAction = { label: string; href: string };

export type StationState = {
  id: StationId;
  mood: StationMood;
  /** Short, truthful status text, e.g. "Scheduled · not yet published". */
  statusLabel: string;
  queue: number;
  queueLabel: string;
  taskTitle: string | null;
  taskHref: string | null;
  lastUpdate: string | null;
  detail: string;
  actions: StationAction[];
  /** No backend data is available; numbers must render as unknown, not zero. */
  unknown?: boolean;
};

export type HandoverKind = "handover" | "revision" | "complete" | "scheduled" | "failed";

/**
 * A transition observed between two backend snapshots. `key` is stable for the
 * same underlying change so re-renders and remounts never replay it.
 */
export type StudioEvent = {
  key: string;
  kind: HandoverKind;
  from: StationId;
  to: StationId;
  contentId: string;
  title: string;
  at: string;
};

export type FeedStatus = "live" | "refreshing" | "stale" | "offline" | "error" | "demo" | "unavailable";
