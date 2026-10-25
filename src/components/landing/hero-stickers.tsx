"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useMediaQuery } from "./use-media-query";

import stickers from "./platform-logos.json";
import silhouettes from "./logo-silhouettes.json";

export function HeroStickers() {
  const wallRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const wall = wallRef.current;
    const hero = wall?.closest(".hero");
    if (!wall || !hero || reducedMotion) return;
    hero.classList.add("physics-ready");
    const bodies = Array.from(
      wall.querySelectorAll<HTMLElement>(".float-tile"),
      (el, i) => ({
        el,
        i,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: (i % 2 ? -1 : 1) * (6 + (i % 4) * 2),
        spin: (i % 2 ? -1 : 1) * 0.13,
        width: el.offsetWidth,
        height: el.offsetHeight,
        band: 0,
        bandHeight: 0,
        shape: silhouettes[stickers[i].platform as keyof typeof silhouettes],
        drag: false,
        active: false,
      }),
    );
    let bounds = wall.getBoundingClientRect();
    let visible = true;
    let frame = 0;
    let last = performance.now();
    const began = last;
    const cleanups: (() => void)[] = [];

    function paint() {
      bodies.forEach((body) => {
        body.el.style.transform =
          "translate3d(" +
          body.x +
          "px," +
          body.y +
          "px,0) rotate(" +
          body.angle +
          "deg)";
      });
    }
    function fit() {
      bounds = wall!.getBoundingClientRect();
      const bandSize = bounds.width < 651 ? 4 : bounds.width < 1000 ? 5 : 10;
      bodies.forEach((body) => {
        body.width = body.el.offsetWidth;
        body.height = body.el.offsetHeight;
        body.band = Math.floor(body.i / bandSize);
        body.bandHeight = bounds.height / Math.ceil(bodies.length / bandSize);
        const group = bodies.slice(
          body.band * bandSize,
          (body.band + 1) * bandSize,
        );
        const gap = Math.max(
          8,
          (bounds.width - group.reduce((n, o) => n + o.el.offsetWidth, 0)) /
            (group.length + 1),
        );
        const before = group
          .slice(0, body.i % bandSize)
          .reduce((n, o) => n + o.el.offsetWidth + gap, 0);
        body.x = Math.max(
          5,
          Math.min(bounds.width - body.width - 5, gap + before),
        );
        body.y = body.band * body.bandHeight + 4;
        body.el.style.left = "0";
        body.el.style.top = "0";
      });
      paint();
    }
    function tick(now: number) {
      frame = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(2, (now - last) / 16.67);
      last = now;
      bodies.forEach((body) => {
        if (!body.active && now - began > 350 + body.i * 220) {
          body.active = true;
          body.vy = 0.4;
          body.vx = (body.i % 2 ? -1 : 1) * (0.45 + body.i * 0.1);
        }
        if (!body.active || body.drag) return;
        body.vy += 0.2 * dt;
        body.vx *= Math.pow(0.997, dt);
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angle += body.spin * dt;
        body.spin *= Math.pow(0.995, dt);
        const maxX = bounds.width - body.width;
        const maxY = (body.band + 1) * body.bandHeight - body.height - 9;
        if (body.x < 4) {
          body.x = 4;
          body.vx = Math.abs(body.vx) * 0.68;
          body.spin += 0.18;
        }
        if (body.x > maxX - 4) {
          body.x = maxX - 4;
          body.vx = -Math.abs(body.vx) * 0.68;
          body.spin -= 0.18;
        }
        if (body.y > maxY) {
          body.y = maxY;
          body.vy = Math.abs(body.vy) < 0.9 ? 0 : -body.vy * 0.57;
          body.vx *= 0.985;
          body.spin *= 0.93;
        }
      });
      for (let i = 0; i < bodies.length; i++)
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i],
            b = bodies[j];
          if (!a.active || !b.active || a.band !== b.band) continue;
          const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
          const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          if (
            Math.hypot(ac.x - bc.x, ac.y - bc.y) >
            (Math.hypot(a.width, a.height) + Math.hypot(b.width, b.height)) / 2
          )
            continue;
          const dots = (body: (typeof bodies)[number]) => {
            const t = (body.angle * Math.PI) / 180,
              c = Math.cos(t),
              sn = Math.sin(t);
            return body.shape.points.map(([u, v]) => {
              const x = (u - 0.5) * body.width,
                y = (v - 0.5) * body.height;
              return {
                x: body.x + body.width / 2 + x * c - y * sn,
                y: body.y + body.height / 2 + x * sn + y * c,
              };
            });
          };
          const radius = a.shape.radius * a.width + b.shape.radius * b.width;
          let hit: { nx: number; ny: number; depth: number } | null = null;
          const aDots = dots(a),
            bDots = dots(b);
          for (const ap of aDots)
            for (const bp of bDots) {
              const dx = bp.x - ap.x,
                dy = bp.y - ap.y,
                distance = Math.hypot(dx, dy);
              if (distance < radius && (!hit || radius - distance > hit.depth))
                hit = {
                  nx: distance ? dx / distance : 1,
                  ny: distance ? dy / distance : 0,
                  depth: radius - distance,
                };
            }
          if (!hit) continue;
          const { nx, ny, depth } = hit,
            push = depth / (a.drag || b.drag ? 1 : 2);
          if (!a.drag) {
            a.x -= nx * push;
            a.y -= ny * push;
          }
          if (!b.drag) {
            b.x += nx * push;
            b.y += ny * push;
          }
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relative < 0) {
            const impulse = -relative * 0.66;
            if (!a.drag) {
              a.vx -= nx * impulse;
              a.vy -= ny * impulse;
            }
            if (!b.drag) {
              b.vx += nx * impulse;
              b.vy += ny * impulse;
            }
          }
        }
      bodies.forEach((body) => {
        const t = (body.angle * Math.PI) / 180;
        const rx =
          (Math.abs(Math.cos(t)) * body.width +
            Math.abs(Math.sin(t)) * body.height) /
          2;
        const ry =
          (Math.abs(Math.sin(t)) * body.width +
            Math.abs(Math.cos(t)) * body.height) /
          2;
        body.x = Math.max(
          rx - body.width / 2 + 4,
          Math.min(bounds.width - rx - body.width / 2 - 4, body.x),
        );
        body.y = Math.max(
          body.band * body.bandHeight + ry - body.height / 2 + 4,
          Math.min(
            (body.band + 1) * body.bandHeight - ry - body.height / 2 - 9,
            body.y,
          ),
        );
      });
      paint();
      frame = requestAnimationFrame(tick);
    }
    function resume() {
      if (visible && !document.hidden && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    bodies.forEach((body) => {
      let offsetX = 0,
        offsetY = 0,
        previousX = 0,
        previousY = 0,
        previousTime = 0;
      function down(event: PointerEvent) {
        event.preventDefault();
        body.active = body.drag = true;
        body.vx = body.vy = 0;
        body.el.classList.add("is-dragging");
        body.el.setPointerCapture(event.pointerId);
        const rect = wall!.getBoundingClientRect();
        offsetX = event.clientX - rect.left - body.x;
        offsetY = event.clientY - rect.top - body.y;
        previousX = body.x;
        previousY = body.y;
        previousTime = event.timeStamp;
      }
      function move(event: PointerEvent) {
        if (!body.drag) return;
        const rect = wall!.getBoundingClientRect();
        const x = Math.max(
          0,
          Math.min(
            bounds.width - body.width,
            event.clientX - rect.left - offsetX,
          ),
        );
        const y = Math.max(
          body.band * body.bandHeight,
          Math.min(
            (body.band + 1) * body.bandHeight - body.height,
            event.clientY - rect.top - offsetY,
          ),
        );
        const elapsed = Math.max(8, event.timeStamp - previousTime);
        body.vx = Math.max(
          -25,
          Math.min(25, ((x - previousX) * 16.67) / elapsed),
        );
        body.vy = Math.max(
          -25,
          Math.min(25, ((y - previousY) * 16.67) / elapsed),
        );
        body.x = x;
        body.y = y;
        body.angle += body.vx * 0.12;
        previousX = x;
        previousY = y;
        previousTime = event.timeStamp;
        paint();
      }
      function release() {
        body.drag = false;
        body.el.classList.remove("is-dragging");
      }
      body.el.addEventListener("pointerdown", down);
      body.el.addEventListener("pointermove", move);
      body.el.addEventListener("pointerup", release);
      body.el.addEventListener("pointercancel", release);
      body.el.addEventListener("lostpointercapture", release);
      cleanups.push(() => {
        body.el.removeEventListener("pointerdown", down);
        body.el.removeEventListener("pointermove", move);
        body.el.removeEventListener("pointerup", release);
        body.el.removeEventListener("pointercancel", release);
        body.el.removeEventListener("lostpointercapture", release);
        body.el.classList.remove("is-dragging");
        body.el.style.removeProperty("left");
        body.el.style.removeProperty("top");
        body.el.style.removeProperty("transform");
      });
    });
    fit();
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    const resize = new ResizeObserver(() => fit());
    intersection.observe(hero);
    resize.observe(wall);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      cancelAnimationFrame(frame);
      intersection.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", resume);
      cleanups.forEach((cleanup) => cleanup());
      hero.classList.remove("physics-ready");
    };
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
