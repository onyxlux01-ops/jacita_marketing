"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useMediaQuery } from "./use-media-query";

import stickers from "./platform-logos.json";

const logos: ((typeof stickers)[number] & {
  src?: string;
  imageSize?: number;
  whiteKey?: boolean;
  rounded?: boolean;
})[] = stickers;

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
      {logos.map((logo) => {
        const [x, y, width, height] = logo.viewBox.split(" ").map(Number);
        const maskId = `landing-icon-${logo.platform}`;
        return (
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
          <svg
            viewBox={logo.viewBox}
            role="img"
            aria-label={logo.label}
            style={logo.src ? { overflow: "hidden" } : undefined}
          >
            {logo.whiteKey && (
              <defs>
                <filter id={maskId} x={x} y={y} width={width} height={height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  {/* Key white paper at render time; the supplied JPEG stays intact. */}
                  <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 0 3" />
                  <feComponentTransfer>
                    <feFuncA type="linear" slope="1.15" intercept="-0.1" />
                  </feComponentTransfer>
                </filter>
              </defs>
            )}
            {logo.rounded && (
              <defs>
                <clipPath id={maskId}>
                  <rect x={x} y={y} width={width} height={height} rx="55" />
                </clipPath>
              </defs>
            )}
            <image
              href={logo.src ?? "/landing/social-logos/" + logo.platform + ".png"}
              width={logo.imageSize ?? 2000}
              height={logo.imageSize ?? 2000}
              filter={logo.whiteKey ? `url(#${maskId})` : undefined}
              clipPath={logo.rounded ? `url(#${maskId})` : undefined}
            />
          </svg>
        </div>
        );
      })}
    </div>
  );
}
