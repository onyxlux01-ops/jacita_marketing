"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useMediaQuery } from "./use-media-query";

import stickers from "./platform-logos.json";


export function HeroStickers() {
  const wallRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall || reducedMotion) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("./logo-pile").then(({ startLogoPile }) => {
      if (!disposed) cleanup = startLogoPile(wall);
    }).catch(() => { /* The static logo layout remains usable if loading fails. */ });
    return () => { disposed = true; cleanup?.(); };
  }, [reducedMotion]);
  return (
    <div className="sticker-wall" ref={wallRef} aria-hidden="true">
      {stickers.map((logo) => (
        <div
          key={logo.platform}
          className="float-tile social-logo"
          style={
            {
              "--logo-width": logo.width + "px",
              "--logo-ratio": logo.ratio,
              "--rest-x": logo.x,
              "--rest-y": logo.y,
            } as CSSProperties
          }
        >
          <svg viewBox={logo.viewBox} role="img" aria-label={logo.label}>
            <image
              href={"/landing/social-logos/" + logo.platform + ".png"}
              width="2000"
              height="2000"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
