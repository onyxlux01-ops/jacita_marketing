"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "./use-media-query";

const sets = [
  ["STUDIO 01", "BRAND 02", "SHOP 03", "TEAM 04"],
  ["CLIENT 05", "ATELIER 06", "MAKER 07", "SPACE 08"],
];

export function ClientLogos() {
  const [index, setIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || reducedMotion) return;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(grid);
    const timer = window.setInterval(() => {
      if (visible && !document.hidden && !grid.matches(":hover"))
        setIndex((value) => (value + 1) % sets.length);
    }, 4200);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, [reducedMotion]);
  return (
    <div
      className="logo-grid"
      aria-label="Illustrative logo layout"
      ref={gridRef}
    >
      {sets[index].map((label) => (
        <div className="logo-cell" key={label}>
          <span className="logo-mark">{label}</span>
        </div>
      ))}
    </div>
  );
}
