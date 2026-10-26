"use client";

import { useEffect, useRef } from "react";
import styles from "./hero-cloud-background.module.css";

export function HeroCloudBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("./hero-clouds").then(({ startHeroClouds }) => {
      if (!disposed && canvas.current) cleanup = startHeroClouds(canvas.current);
    }).catch(() => { /* The static CSS background stays visible. */ });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  return (
    <div className={styles.scene} aria-hidden="true">
      <canvas ref={canvas} className={styles.canvas} width="1" height="1" />
    </div>
  );
}
