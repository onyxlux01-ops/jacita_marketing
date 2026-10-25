"use client";

import { useEffect, useRef } from "react";
import { startEyeTracking } from "./eye-tracking";

export function HomepageEyeTracker() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest("main");
    if (root) return startEyeTracking(root);
  }, []);
  return <span hidden ref={marker} aria-hidden="true" />;
}
