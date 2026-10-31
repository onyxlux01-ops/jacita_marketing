import type { StationId, StationMood } from "./types";

export type StationDefinition = {
  id: StationId;
  order: number;
  name: string;
  shortName: string;
  role: string;
  agent: string;
  description: string;
};

export const STATIONS: StationDefinition[] = [
  {
    id: "brief",
    order: 1,
    name: "Client Brief",
    shortName: "Brief",
    role: "Account manager",
    agent: "Amara",
    description:
      "Reviews brand rules, uploaded assets and active campaigns, then prepares briefs for the studio.",
  },
  {
    id: "content",
    order: 2,
    name: "AI Content Studio",
    shortName: "Studio",
    role: "Creative",
    agent: "Theo",
    description:
      "Drafts captions, visuals and video concepts, and reworks anything returned from review.",
  },
  {
    id: "review",
    order: 3,
    name: "Review Desk",
    shortName: "Review",
    role: "Reviewer",
    agent: "Priya",
    description:
      "Holds drafts until you approve them. Approved work moves to publishing; revisions go back to the studio.",
  },
  {
    id: "publishing",
    order: 4,
    name: "Publishing Station",
    shortName: "Publishing",
    role: "Publisher",
    agent: "Kenji",
    description:
      "Arranges the calendar and dispatches posts. Success is shown only once a provider confirms publication.",
  },
  {
    id: "analytics",
    order: 5,
    name: "Analytics & Leads",
    shortName: "Analytics",
    role: "Analyst",
    agent: "Marcus",
    description:
      "Watches recorded performance and enquiries, and flags anything that needs a follow-up.",
  },
];

export const STATION_BY_ID = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
) as Record<StationId, StationDefinition>;

export const MOOD_META: Record<
  StationMood,
  { label: string; tone: "neutral" | "teal" | "amber" | "blue" | "red" | "green" | "purple" }
> = {
  idle: { label: "Idle", tone: "neutral" },
  working: { label: "Working", tone: "teal" },
  waiting: { label: "Awaiting approval", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "blue" },
  blocked: { label: "Blocked", tone: "red" },
  attention: { label: "Needs attention", tone: "purple" },
  done: { label: "Confirmed", tone: "green" },
};

/**
 * Valid station-to-station moves. Anything else is ignored rather than animated,
 * so a malformed or out-of-order change can never send work the wrong way.
 */
export const VALID_TRANSITIONS: ReadonlyArray<readonly [StationId, StationId]> = [
  ["brief", "content"],
  ["content", "review"],
  ["review", "content"],
  ["review", "publishing"],
  ["publishing", "analytics"],
  ["analytics", "brief"],
];

export function isValidTransition(from: StationId, to: StationId) {
  return VALID_TRANSITIONS.some(([a, b]) => a === from && b === to);
}
