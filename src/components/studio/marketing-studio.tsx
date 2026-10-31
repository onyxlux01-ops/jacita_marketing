"use client";

import dynamic from "next/dynamic";
import { Component, startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, FlaskConical, Map as MapIcon, Minus, Plus, RefreshCw, RotateCcw, Rows3 } from "lucide-react";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { Switch } from "@/components/ui/switch";
import type { OrganisationSummary } from "@/lib/org";
import { STATION_BY_ID } from "@/lib/studio/stations";
import type { FeedStatus, StationId, StudioSnapshot } from "@/lib/studio/types";
import { StationDetail, StudioList, StudioPlan } from "./studio-panels";
import { useStudioFeed } from "./use-studio-feed";
import "./studio.css";

const StudioScene = dynamic(() => import("./scene/studio-scene"), {
  ssr: false,
  loading: () => <div className="studio-loading">Opening the studio…</div>,
});

const PREFS_KEY = "jacita.studio.prefs";
const ZOOM_STEPS = [1, 1.35, 1.75];

type Prefs = { view?: "studio" | "list"; animate?: boolean };

function readPrefs(): Prefs {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...prefs }));
  } catch {
    /* preferences are a convenience only */
  }
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* the plan fallback below carries the same information */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const STATUS_COPY: Record<FeedStatus, string> = {
  live: "Live",
  refreshing: "Refreshing",
  stale: "Stale",
  offline: "Offline",
  error: "Update failed",
  demo: "Demo mode",
  unavailable: "Live data unavailable",
};

function FeedBanner({
  status,
  lastSuccess,
  timeZone,
  onRetry,
  onDemo,
}: {
  status: FeedStatus;
  lastSuccess: number | null;
  timeZone: string;
  onRetry: () => void;
  onDemo: () => void;
}) {
  const time = lastSuccess
    ? new Date(lastSuccess).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" })
    : null;
  let message: ReactNode;
  switch (status) {
    case "demo":
      message = "Simulated events only — nothing here is a business record, and nothing is saved.";
      break;
    case "live":
    case "refreshing":
      message = `Showing stored records · updated ${time}. Animation reflects task state; it never changes it.`;
      break;
    case "stale":
      message = `Paused · showing the last known state from ${time}. Movement is stopped until data refreshes.`;
      break;
    case "offline":
      message = `You're offline · showing the last known state from ${time}.`;
      break;
    case "error":
      message = `The latest update failed · showing records from ${time}.`;
      break;
    case "unavailable":
      message = (
        <>
          Business records couldn&rsquo;t be loaded, so nothing is shown as in progress.{" "}
          <button type="button" className="studio-inline-btn" onClick={onDemo}>
            Try demo mode
          </button>
        </>
      );
      break;
  }
  return (
    <div className="studio-banner" data-status={status} role="status">
      <span className="studio-status-pill">
        <i aria-hidden />
        {STATUS_COPY[status]}
      </span>
      <span className="studio-banner-text">{message}</span>
      {(status === "stale" || status === "error" || status === "live" || status === "refreshing") && (
        <button
          type="button"
          className="studio-icon-btn"
          onClick={onRetry}
          aria-label="Refresh studio data"
          disabled={status === "refreshing"}
        >
          <RefreshCw size={13} />
        </button>
      )}
    </div>
  );
}

export function MarketingStudio({
  organisationId,
  businessName,
  initialSnapshot,
  initialError,
  organisations,
  active,
  canAddBusiness,
}: {
  organisationId: string | null;
  businessName: string;
  initialSnapshot: StudioSnapshot | null;
  initialError: boolean;
  organisations: OrganisationSummary[];
  active: OrganisationSummary | null;
  canAddBusiness: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<"studio" | "list">("studio");
  const [animate, setAnimate] = useState(true);
  const [selected, setSelected] = useState<StationId | null>(null);
  const [zoom, setZoom] = useState(0);
  const [onscreen, setOnscreen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [compact, setCompact] = useState(false);

  const feed = useStudioFeed({ organisationId, initial: initialSnapshot, initialError });
  const { demo, setDemo } = feed;
  const timeZone = feed.snapshot?.timezone ?? "Europe/London";

  // Preferences, reduced motion and capability checks run once on the client.
  useEffect(() => {
    const sync = () =>
      startTransition(() => {
        const prefs = readPrefs();
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setView(prefs.view ?? "studio");
        setAnimate(prefs.animate ?? !reduced);
        setWebgl(hasWebGL());
      });
    sync();
  }, []);

  useEffect(() => {
    const onVisibility = () => startTransition(() => setPageVisible(document.visibilityState === "visible"));
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Load lazily on first approach, and pause whenever the stage is off screen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setOnscreen(entry.isIntersecting);
        if (entry.isIntersecting) setSeen(true);
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 640));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [view]);

  const select = useCallback((id: StationId) => {
    setSelected(id);
    requestAnimationFrame(() => {
      const narrow = window.matchMedia("(max-width: 1099px)").matches;
      detailRef.current?.focus({ preventScroll: !narrow });
      if (narrow) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const frozen = feed.status === "stale" || feed.status === "offline" || feed.status === "unavailable";
  const moving = animate && !frozen;
  const showScene = view === "studio" && webgl !== false;

  return (
    <section className="glass-panel studio-panel" aria-labelledby="studio-title">
      <div className="studio-head">
        <div>
          <p className="eyebrow">
            <span className="signal-dot" /> Your marketing agency, at work
          </p>
          <h2 id="studio-title">Marketing Studio</h2>
          <p className="panel-subtitle">
            Five connected stations. Characters act out what your records say is happening — they never move work on their own.
          </p>
        </div>
        <div className="studio-controls">
          {organisations.length > 0 ? (
            <div className="studio-business">
              <Building2 size={14} aria-hidden />
              <BusinessSwitcher organisations={organisations} active={active} variant="compact" canAddBusiness={canAddBusiness} />
            </div>
          ) : null}
          <div className="studio-segment" role="group" aria-label="Studio display">
            <button
              type="button"
              aria-pressed={view === "studio"}
              onClick={() => {
                setView("studio");
                writePrefs({ view: "studio" });
              }}
            >
              <MapIcon size={13} /> Studio
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => {
                setView("list");
                writePrefs({ view: "list" });
              }}
            >
              <Rows3 size={13} /> List
            </button>
          </div>
          <label className="studio-toggle">
            <Switch
              checked={animate}
              onCheckedChange={(v) => {
                setAnimate(v);
                writePrefs({ animate: v });
              }}
              aria-label="Animation"
            />
            Animation
          </label>
          <label className="studio-toggle">
            <Switch checked={demo} onCheckedChange={setDemo} aria-label="Demo mode" />
            <FlaskConical size={13} aria-hidden /> Demo
          </label>
        </div>
      </div>

      <FeedBanner
        status={feed.status}
        lastSuccess={feed.lastSuccess}
        timeZone={timeZone}
        onRetry={() => void feed.refresh()}
        onDemo={() => setDemo(true)}
      />

      <div className="studio-body">
        {view === "studio" ? (
          <div className="studio-stage" ref={stageRef} data-demo={demo || undefined}>
            {webgl === false ? (
              <StudioPlan
                states={feed.states}
                selected={selected}
                onSelect={select}
                reason="3D isn't available on this device, so here's a simplified plan of the studio."
              />
            ) : showScene && seen && webgl ? (
              <SceneBoundary
                fallback={
                  <StudioPlan
                    states={feed.states}
                    selected={selected}
                    onSelect={select}
                    reason="The 3D studio couldn't start, so here's a simplified plan instead."
                  />
                }
              >
                <StudioScene
                  key={demo ? "demo" : (organisationId ?? "none")}
                  states={feed.states}
                  events={feed.events}
                  selected={selected}
                  onSelect={select}
                  animate={moving}
                  visible={onscreen && pageVisible}
                  zoom={ZOOM_STEPS[zoom]}
                  compact={compact}
                />
              </SceneBoundary>
            ) : (
              <div className="studio-loading">Opening the studio…</div>
            )}
            {demo && <span className="studio-demo-tag">Demo · simulated</span>}
            {frozen && webgl !== false && feed.status !== "unavailable" && (
              <span className="studio-paused-tag">Paused · last known state</span>
            )}
            {webgl !== false && (
              <div className="studio-camera" role="group" aria-label="Camera">
                <button
                  type="button"
                  className="studio-icon-btn"
                  aria-label="Zoom out"
                  disabled={zoom === 0}
                  onClick={() => setZoom((z) => Math.max(0, z - 1))}
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  className="studio-icon-btn"
                  aria-label={selected ? `Zoom in towards ${STATION_BY_ID[selected].name}` : "Zoom in"}
                  disabled={zoom === ZOOM_STEPS.length - 1}
                  onClick={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
                >
                  <Plus size={14} />
                </button>
                <button type="button" className="studio-reset" onClick={() => setZoom(0)}>
                  <RotateCcw size={12} /> Reset view
                </button>
              </div>
            )}
          </div>
        ) : (
          <StudioList
            states={feed.states}
            businessName={businessName}
            timeZone={timeZone}
            demo={demo}
            onShow={(id) => {
              setView("studio");
              writePrefs({ view: "studio" });
              select(id);
            }}
          />
        )}
        <StationDetail
          ref={detailRef}
          selected={selected}
          states={feed.states}
          businessName={businessName}
          timeZone={timeZone}
          demo={demo}
          onSelect={select}
        />
      </div>
    </section>
  );
}
