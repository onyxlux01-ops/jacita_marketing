"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DemoSimulator } from "@/lib/studio/demo";
import type { FeedStatus, StudioEvent, StudioSnapshot } from "@/lib/studio/types";
import { deriveEvents, deriveStations, unavailableStations } from "@/lib/studio/workflow";

const POLL_MS = 45_000;
const STALE_MS = 3 * 60_000;
const DEMO_STEP_MS = 6_500;
const MAX_EVENTS = 24;

type Feed = {
  snapshot: StudioSnapshot | null;
  events: StudioEvent[];
  lastSuccess: number | null;
  failed: boolean;
};

/**
 * Live studio data for exactly one business, plus an isolated demo feed.
 * Responses for any other business are discarded, and demo snapshots never
 * touch the live feed's state.
 */
export function useStudioFeed({
  organisationId,
  initial,
  initialError,
}: {
  organisationId: string | null;
  initial: StudioSnapshot | null;
  initialError: boolean;
}) {
  const [live, setLive] = useState<Feed>(() => ({
    snapshot: initial && initial.organisationId === organisationId ? initial : null,
    events: [],
    lastSuccess: initial ? new Date(initial.fetchedAt).getTime() : null,
    failed: initialError,
  }));
  const [demoFeed, setDemoFeed] = useState<Feed | null>(null);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const simulator = useRef<DemoSimulator | null>(null);
  const demo = demoFeed !== null;

  const refresh = useCallback(async () => {
    if (!organisationId || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/studio/snapshot?organisation_id=${encodeURIComponent(organisationId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as StudioSnapshot;
      if (next.organisationId !== organisationId || next.demo) throw new Error("scope");
      setLive((prev) => {
        const fresh = deriveEvents(prev.snapshot, next);
        return {
          snapshot: next,
          events: fresh.length ? [...prev.events, ...fresh].slice(-MAX_EVENTS) : prev.events,
          lastSuccess: Date.now(),
          failed: false,
        };
      });
    } catch {
      setLive((prev) => ({ ...prev, failed: true }));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
      setNow(Date.now());
    }
  }, [organisationId]);

  // Poll only while the page is visible and online; catch up on return.
  useEffect(() => {
    if (demo || !organisationId) return;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, POLL_MS);
    };
    const tick = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo, organisationId, refresh]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearInterval(clock);
    };
  }, []);

  // Demo mode: a local simulator, created fresh each time and discarded after.
  const setDemo = useCallback((on: boolean) => {
    if (!on) {
      simulator.current = null;
      setDemoFeed(null);
      return;
    }
    simulator.current = new DemoSimulator();
    setDemoFeed({ snapshot: simulator.current.snapshot(), events: [], lastSuccess: Date.now(), failed: false });
  }, []);

  useEffect(() => {
    if (!demo) return;
    const timer = window.setInterval(() => {
      const sim = simulator.current;
      if (!sim || document.visibilityState !== "visible") return;
      const next = sim.step();
      setDemoFeed((prev) => {
        const fresh = deriveEvents(prev?.snapshot ?? null, next);
        return {
          snapshot: next,
          events: [...(prev?.events ?? []), ...fresh].slice(-MAX_EVENTS),
          lastSuccess: Date.now(),
          failed: false,
        };
      });
    }, DEMO_STEP_MS);
    return () => window.clearInterval(timer);
  }, [demo]);

  const feed = demo ? demoFeed : live;
  const snapshot = feed?.snapshot ?? null;

  let status: FeedStatus;
  if (demo) status = "demo";
  else if (!snapshot) status = "unavailable";
  else if (!online) status = "offline";
  else if (live.lastSuccess && now - live.lastSuccess > STALE_MS) status = "stale";
  else if (live.failed) status = "error";
  else if (refreshing) status = "refreshing";
  else status = "live";

  const states = useMemo(
    () => (snapshot ? deriveStations(snapshot) : unavailableStations()),
    [snapshot],
  );

  return {
    snapshot,
    states,
    events: feed?.events ?? [],
    status,
    lastSuccess: feed?.lastSuccess ?? null,
    refresh,
    demo,
    setDemo,
  };
}
