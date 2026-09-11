"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { HeroFallback } from "./hero-fallback";
import { HeroSceneErrorBoundary } from "./hero-scene-error-boundary";
import { useHeroEnvironment } from "./use-hero-environment";

const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <HeroFallback />,
});

/** Decorative 3D / fallback layer only — does not alter hero UX. */
export function HeroVisual() {
  const rootRef = useRef<HTMLDivElement>(null);
  const env = useHeroEnvironment(rootRef);
  const use3d = env.ready && env.webgl;
  const pointer = env.reducedMotion ? { x: 0, y: 0 } : env.pointer;
  const tilt = env.reducedMotion ? { x: 0, y: 0 } : env.tilt;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      {!env.ready || !use3d ? (
        <HeroFallback isMobile={env.ready ? env.isMobile : false} />
      ) : (
        <HeroSceneErrorBoundary isMobile={env.isMobile}>
          <HeroScene
            isMobile={env.isMobile}
            isTablet={env.isTablet}
            reducedMotion={env.reducedMotion}
            visible={env.visible}
            pointer={pointer}
            tilt={tilt}
          />
        </HeroSceneErrorBoundary>
      )}
    </div>
  );
}
