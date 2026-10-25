"use client";

import { useEffect, useRef } from "react";
import { useMediaQuery } from "./use-media-query";

const stickers = [
  ["ig", "◎", "Instagram"],
  ["fb", "f", "Facebook"],
  ["tk", "♪", "TikTok"],
  ["cv", "Canva", "Creative tools"],
  ["th", "@", "Threads"],
  ["mt", "∞", "Meta"],
] as const;
const placement = [0.09, 0.79, 0.87, 0.16, 0.24, 0.77];

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
        angle: (i % 2 ? -1 : 1) * (8 + i * 3),
        spin: (i % 2 ? -1 : 1) * 0.13,
        size: el.offsetWidth,
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
    function fit(initial = false) {
      const next = wall!.getBoundingClientRect();
      const oldWidth = Math.max(1, bounds.width);
      const oldHeight = Math.max(1, bounds.height);
      bounds = next;
      bodies.forEach((body) => {
        body.size = body.el.offsetWidth;
        body.x = initial
          ? Math.max(
              5,
              Math.min(
                next.width - body.size - 5,
                placement[body.i] * next.width - body.size / 2,
              ),
            )
          : Math.max(
              0,
              Math.min(
                next.width - body.size,
                (body.x * next.width) / oldWidth,
              ),
            );
        body.y = initial
          ? -body.size - 15
          : Math.max(
              -body.size,
              Math.min(
                next.height - body.size,
                (body.y * next.height) / oldHeight,
              ),
            );
        body.el.style.left = "0";
        body.el.style.top = "0";
      });
      paint();
    }
    function tick(now: number) {
      frame = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(8, (now - last) / 16.67);
      last = now;
      bodies.forEach((body) => {
        if (!body.active && now - began > 350 + body.i * 460) {
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
        const maxX = bounds.width - body.size;
        const maxY = bounds.height - body.size - 9;
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
          if (!a.active || !b.active) continue;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const limit = (a.size + b.size) * 0.48,
            distance = Math.hypot(dx, dy) || 0.001;
          if (distance >= limit) continue;
          const nx = dx / distance,
            ny = dy / distance,
            push = (limit - distance) * 0.51;
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
            bounds.width - body.size,
            event.clientX - rect.left - offsetX,
          ),
        );
        const y = Math.max(
          0,
          Math.min(
            bounds.height - body.size,
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
      cleanups.push(() => {
        body.el.removeEventListener("pointerdown", down);
        body.el.removeEventListener("pointermove", move);
        body.el.removeEventListener("pointerup", release);
        body.el.removeEventListener("pointercancel", release);
        body.el.classList.remove("is-dragging");
        body.el.removeAttribute("style");
      });
    });
    fit(true);
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
      {stickers.map(([variant, symbol, label]) => (
        <div key={variant} className={"float-tile " + variant}>
          <span>{symbol}</span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}
