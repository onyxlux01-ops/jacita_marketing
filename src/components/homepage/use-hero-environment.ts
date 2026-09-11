"use client";

import {
  startTransition,
  useEffect,
  useState,
  type RefObject,
} from "react";

export type PointerNorm = { x: number; y: number };

export type HeroEnvironment = {
  ready: boolean;
  webgl: boolean;
  reducedMotion: boolean;
  isMobile: boolean;
  isTablet: boolean;
  visible: boolean;
  pointer: PointerNorm;
  tilt: PointerNorm;
};

function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export function useHeroEnvironment(root: RefObject<HTMLElement | null>) {
  const [env, setEnv] = useState<HeroEnvironment>({
    ready: false,
    webgl: true,
    reducedMotion: false,
    isMobile: false,
    isTablet: false,
    visible: true,
    pointer: { x: 0, y: 0 },
    tilt: { x: 0, y: 0 },
  });

  useEffect(() => {
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqMobile = window.matchMedia("(max-width: 768px)");
    const mqTablet = window.matchMedia(
      "(min-width: 769px) and (max-width: 1024px)"
    );

    const sync = () => {
      startTransition(() => {
        setEnv((prev) => ({
          ...prev,
          ready: true,
          webgl: detectWebGL(),
          reducedMotion: mqMotion.matches,
          isMobile: mqMobile.matches,
          isTablet: mqTablet.matches,
        }));
      });
    };

    sync();
    mqMotion.addEventListener("change", sync);
    mqMobile.addEventListener("change", sync);
    mqTablet.addEventListener("change", sync);

    const onPointer = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      startTransition(() => {
        setEnv((prev) => ({ ...prev, pointer: { x, y } }));
      });
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let observer: IntersectionObserver | null = null;
    if (root.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          startTransition(() => {
            setEnv((prev) => ({ ...prev, visible: entry.isIntersecting }));
          });
        },
        { threshold: 0.12 }
      );
      observer.observe(root.current);
    }

    let orientationBound = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      startTransition(() => {
        setEnv((prev) => ({
          ...prev,
          tilt: {
            x: Math.max(-1, Math.min(1, gamma / 30)),
            y: Math.max(-1, Math.min(1, (beta - 45) / 30)),
          },
        }));
      });
    };

    const bindOrientation = () => {
      if (orientationBound) return;
      orientationBound = true;
      window.addEventListener("deviceorientation", onOrient);
    };

    const requestTilt = async () => {
      if (!mqMobile.matches) return;
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>;
      };
      try {
        if (typeof DOE.requestPermission === "function") {
          if ((await DOE.requestPermission()) === "granted") bindOrientation();
        } else {
          bindOrientation();
        }
      } catch {
        /* no-op */
      }
    };

    const onFirstInteract = () => {
      void requestTilt();
      window.removeEventListener("touchstart", onFirstInteract);
      window.removeEventListener("click", onFirstInteract);
    };
    window.addEventListener("touchstart", onFirstInteract, { passive: true });
    window.addEventListener("click", onFirstInteract);

    return () => {
      mqMotion.removeEventListener("change", sync);
      mqMobile.removeEventListener("change", sync);
      mqTablet.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchstart", onFirstInteract);
      window.removeEventListener("click", onFirstInteract);
      if (orientationBound) {
        window.removeEventListener("deviceorientation", onOrient);
      }
      observer?.disconnect();
    };
  }, [root]);

  return env;
}
