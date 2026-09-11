"use client";

import { HERO_CAPTIONS } from "./hero-objects";

export function HeroCaptions() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {HERO_CAPTIONS.map((cap) => (
        <div
          key={cap.id}
          className="absolute max-w-[9.5rem]"
          style={{ left: cap.left, top: cap.top, textAlign: cap.align }}
        >
          <p className="text-[13px] font-medium tracking-tight text-neutral-500">
            {cap.title}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-neutral-400">
            {cap.line}
          </p>
        </div>
      ))}
    </div>
  );
}
