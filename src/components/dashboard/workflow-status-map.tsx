import Link from "next/link";
import {
  BarChart3,
  Building2,
  Send,
  Share2,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  FlowNodeId,
  FlowState,
  WorkflowStatus,
} from "@/lib/dashboard/workflow-status";
import styles from "./workflow-status-map.module.css";

const icons: Record<FlowNodeId, LucideIcon> = {
  brief: Building2,
  accounts: Share2,
  automation: Zap,
  engine: Sparkles,
  publishing: Send,
  results: BarChart3,
};

// Hub layout: three inputs feed the content engine, which feeds two outputs.
// Paths use a 1000 x 360 box that matches the map's aspect ratio, so the dots stay round.
const connectors: Array<{ from: FlowNodeId; to: FlowNodeId; d: string }> = [
  { from: "brief", to: "engine", d: "M300 60 C340 60 340 180 380 180" },
  { from: "accounts", to: "engine", d: "M300 180 L380 180" },
  { from: "automation", to: "engine", d: "M300 300 C340 300 340 180 380 180" },
  { from: "engine", to: "publishing", d: "M620 180 C660 180 660 120 700 120" },
  { from: "engine", to: "results", d: "M620 180 C660 180 660 240 700 240" },
];

// A connector is only as healthy as the steps at either end of it.
function connectorState(
  from: FlowState,
  to: FlowState,
): FlowState {
  if (from === "attention" || to === "attention") return "attention";
  if (from === "ok" && to === "ok") return "ok";
  return "idle";
}

const stateLabel: Record<FlowState, string> = {
  ok: "Working",
  attention: "Needs attention",
  idle: "Not started",
};

export function WorkflowStatusMap({ status }: { status: WorkflowStatus }) {
  const byId = Object.fromEntries(
    status.nodes.map((node) => [node.id, node]),
  ) as Record<FlowNodeId, (typeof status.nodes)[number]>;

  return (
    <section
      className={styles.panel}
      aria-labelledby="workflow-status-title"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Workflow</p>
          <h2 id="workflow-status-title">Is everything working?</h2>
        </div>
        <span
          className={`${styles.summary} ${styles[status.summary.state]}`}
          role="status"
        >
          {status.summary.label}
        </span>
      </header>
      <div className={styles.map}>
        <svg
          className={styles.wires}
          viewBox="0 0 1000 360"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {connectors.map((connector) => {
            const state = connectorState(
              byId[connector.from].state,
              byId[connector.to].state,
            );
            return (
              <g key={`${connector.from}-${connector.to}`}>
                <path
                  className={`${styles.wire} ${styles[state]}`}
                  d={connector.d}
                />
                {state === "ok" && (
                  <circle className={styles.flowDot} r="5">
                    <animateMotion
                      dur="3.2s"
                      repeatCount="indefinite"
                      path={connector.d}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
        {status.nodes.map((node) => {
          const Icon = icons[node.id];
          return (
            <Link
              key={node.id}
              href={node.href}
              className={`${styles.node} ${styles[node.id]} ${styles[node.state]}`}
            >
              <span className={styles.icon}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className={styles.text}>
                <strong>{node.label}</strong>
                <small>{node.detail}</small>
              </span>
              <span className={styles.light} aria-hidden="true" />
              <span className="sr-only">{stateLabel[node.state]}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
