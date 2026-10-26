"use client";

import type { CSSProperties } from "react";
import { useMediaQuery } from "./use-media-query";

export function TrafficTunnel() {
  const mobile = useMediaQuery("(max-width:650px)");
  const width = mobile ? 600 : 1440;
  const count = mobile ? 42 : 54;
  const spacing = mobile ? 5.9 : 9.7;
  return (
    <section className="light-tunnel" id="flow" aria-labelledby="flow-heading">
      <svg
        className="tunnel-svg"
        viewBox={"0 0 " + width + " 900"}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, j) => {
          const i = j - Math.floor(count / 2),
            side = i < 0 ? -1 : 1,
            magnitude = Math.abs(i) + 0.5;
          const x = width / 2 + i * spacing;
          const far =
            width / 2 +
            side * Math.pow(magnitude / (count / 2), 0.84) * width * 1.22;
          const top = 340 + ((j * 37) % 185),
            bend = x + side * (3 + magnitude * 0.15);
          const path =
            "M" +
            x.toFixed(1) +
            " " +
            top +
            " L" +
            x.toFixed(1) +
            " 525 Q" +
            x.toFixed(1) +
            " 554 " +
            bend.toFixed(1) +
            " 566 L" +
            far.toFixed(1) +
            " 990";
          const accent = (j * 19) % 13 < 3;
          const color = accent
            ? j % 2
              ? "#d5b773"
              : "#b99849"
            : (j * 7) % 5 === 0
              ? "#87b5ed"
              : "#417bc5";
          return ["beam-base", "beam-core", "beam-streak"].map((kind) => (
            <path
              key={j + "-" + kind}
              d={path}
              className={kind}
              stroke={
                kind === "beam-streak"
                  ? accent
                    ? "#f2d994"
                    : "#d5e6fb"
                  : color
              }
              style={
                {
                  color,
                  "--time": 2.4 + (j % 7) * 0.43 + "s",
                  "--delay": -((j * 11) % 31) / 5 + "s",
                } as CSSProperties
              }
            />
          ));
        })}
      </svg>
      <div className="tunnel-copy">
        <div className="eyebrow">THE WORK BEHIND THE GROWTH</div>
        <h2 id="flow-heading">
          Good ideas, moving
          <br />
          in the right direction.
        </h2>
        <p>
          One connected path from understanding your business to content,
          conversations and measurable action.
        </p>
      </div>
    </section>
  );
}
