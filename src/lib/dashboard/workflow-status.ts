// Turns overview figures into the state of each step in the workflow status map.
// "attention" is red, "ok" is green, and "idle" is grey for steps not started yet.
export type FlowState = "ok" | "attention" | "idle";
export type FlowNodeId =
  | "brief"
  | "accounts"
  | "automation"
  | "engine"
  | "publishing"
  | "results";

export type FlowNode = {
  id: FlowNodeId;
  label: string;
  detail: string;
  state: FlowState;
  href: string;
};

export type WorkflowInput = {
  brandLogo: boolean;
  accounts: { total: number; issues: number };
  automation: { enabled: boolean; mode: string; paused: boolean } | null;
  totals: Record<string, number>;
  heldCount: number | null;
  publications: number;
};

export type WorkflowStatus = {
  nodes: FlowNode[];
  attention: number;
  summary: { state: FlowState; label: string };
};

export function workflowStatus(input: WorkflowInput): WorkflowStatus {
  const total = Object.values(input.totals).reduce((sum, n) => sum + n, 0);
  const failed = input.totals.failed ?? 0;
  const inFlight =
    (input.totals.scheduled ?? 0) +
    (input.totals.publishing ?? 0) +
    (input.totals.published ?? 0);

  const brief: FlowNode = input.brandLogo
    ? { id: "brief", label: "Business brief", detail: "Brand assets in place", state: "ok", href: "/app/settings?section=brand" }
    : { id: "brief", label: "Business brief", detail: "Upload a brand logo", state: "attention", href: "/app/settings?section=brand" };

  const accounts: FlowNode =
    input.accounts.total === 0
      ? { id: "accounts", label: "Social accounts", detail: "Not connected yet", state: "idle", href: "/app/social" }
      : input.accounts.issues > 0
        ? { id: "accounts", label: "Social accounts", detail: `${input.accounts.issues} need attention`, state: "attention", href: "/app/social" }
        : { id: "accounts", label: "Social accounts", detail: `${input.accounts.total} connected`, state: "ok", href: "/app/social" };

  const automation: FlowNode = !input.automation || !input.automation.enabled || input.automation.mode === "off"
    ? { id: "automation", label: "Automation", detail: "Off", state: "idle", href: "/app/automation" }
    : input.automation.paused
      ? { id: "automation", label: "Automation", detail: "Paused", state: "attention", href: "/app/automation" }
      : { id: "automation", label: "Automation", detail: `${input.automation.mode} running`, state: "ok", href: "/app/automation" };

  const engine: FlowNode =
    total === 0
      ? { id: "engine", label: "Content engine", detail: "No content yet", state: "idle", href: "/app/content" }
      : failed > 0
        ? { id: "engine", label: "Content engine", detail: `${failed} failed`, state: "attention", href: "/app/content?status=failed" }
        : { id: "engine", label: "Content engine", detail: "No failures", state: "ok", href: "/app/content" };

  const publishing: FlowNode =
    input.heldCount === null
      ? { id: "publishing", label: "Publishing", detail: "Holds unavailable", state: "idle", href: "/app/social" }
      : input.heldCount > 0
        ? { id: "publishing", label: "Publishing", detail: `${input.heldCount} on hold`, state: "attention", href: "/app/social" }
        : inFlight > 0
          ? { id: "publishing", label: "Publishing", detail: "No holds", state: "ok", href: "/app/social" }
          : { id: "publishing", label: "Publishing", detail: "Nothing queued yet", state: "idle", href: "/app/social" };

  const results: FlowNode =
    input.publications > 0
      ? { id: "results", label: "Results", detail: `${input.publications} confirmed`, state: "ok", href: "/app/analytics" }
      : { id: "results", label: "Results", detail: "No confirmed posts yet", state: "idle", href: "/app/analytics" };

  const nodes = [brief, accounts, automation, engine, publishing, results];
  const attention = nodes.filter((node) => node.state === "attention").length;
  const summary: WorkflowStatus["summary"] =
    attention > 0
      ? { state: "attention", label: attention === 1 ? "1 step needs attention" : `${attention} steps need attention` }
      : nodes.some((node) => node.id !== "brief" && node.state === "ok")
        ? { state: "ok", label: "All systems running" }
        : { state: "idle", label: "Nothing running yet" };

  return { nodes, attention, summary };
}
