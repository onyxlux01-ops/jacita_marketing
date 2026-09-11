"use client";

import { DESKTOP_OBJECTS, MOBILE_OBJECTS } from "./hero-objects";

export function HeroFallback({ isMobile = false }: { isMobile?: boolean }) {
  const items = (isMobile ? MOBILE_OBJECTS : DESKTOP_OBJECTS).filter(
    (item) => !item.filler
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-x-0 bottom-0 h-[42%]"
        style={{
          background:
            "linear-gradient(to top, rgba(15,18,24,0.04), transparent 70%)",
        }}
      />

      {items.map((item, i) => {
        const [x, y, z] = item.position;
        const left = 50 + x * 11;
        const top = 48 - y * 13;
        const size = 68 + item.scale * 30;
        const depth = 10 + Math.max(0, z) * 6;
        const rot = (i - 2.5) * 5;

        return (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) rotate(${rot}deg)`,
              opacity: 0.92 - Math.abs(z) * 0.07,
            }}
          >
            <div
              className="absolute left-1/2 rounded-full bg-foreground/10 blur-md"
              style={{
                bottom: -depth * 0.55,
                width: size * 0.72,
                height: size * 0.18,
                transform: "translateX(-50%)",
              }}
            />

            <div
              className="relative size-full overflow-hidden rounded-[1.4rem]"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.92), rgba(240,244,248,0.55))",
                border: "1px solid rgba(15,18,24,0.06)",
                boxShadow: `
                  inset 0 1px 0 rgba(255,255,255,0.95),
                  inset 0 -1px 0 rgba(15,18,24,0.04),
                  0 ${depth * 0.35}px ${depth}px rgba(15,18,24,0.08),
                  0 0 28px ${item.glow}18
                `,
              }}
            >
              <div
                className="pointer-events-none absolute inset-[3px] rounded-[1.15rem]"
                style={{
                  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 0 18px ${item.glow}14`,
                }}
              />

              <div
                className="absolute inset-[18%] rounded-xl opacity-30 blur-md"
                style={{ background: item.glow }}
              />

              <div className="relative flex size-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.logo}
                  alt=""
                  width={34}
                  height={34}
                  className="size-[34px] drop-shadow-sm"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
