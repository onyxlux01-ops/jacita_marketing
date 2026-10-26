"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "./use-media-query";

const words = [
  ["Visibility.", "#d5b773"],
  ["Enquiries.", "#98c3f5"],
  ["Bookings.", "#e9cf93"],
] as const;

export function OutcomeWord() {
  const [index, setIndex] = useState(0);
  const sceneRef = useRef<HTMLElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || reducedMotion) return;
    let visible = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        scene.classList.toggle("is-active", visible);
      },
      { threshold: 0.2 },
    );
    observer.observe(scene);
    const timer = window.setInterval(() => {
      if (visible && !document.hidden)
        setIndex((current) => (current + 1) % words.length);
    }, 4800);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      scene.classList.remove("is-active");
    };
  }, [reducedMotion]);
  const [word, color] = words[index];
  return (
    <section
      className="word-scene"
      id="promise"
      aria-labelledby="promise-heading"
      ref={sceneRef}
    >
      <div className="word-scene-inner">
        <div className="eyebrow" id="promise-heading">
          WHAT THE WORK SHOULD LEAD TO
        </div>
        <div
          className="word-display"
          style={{ "--word-color": color } as CSSProperties}
          aria-live="off"
        >
          <span key={word + "-glow"} className="word-glow" aria-hidden="true">
            {word}
          </span>
          <span key={word} className="word-sharp">
            {word}
          </span>
        </div>
        <p>
          Attention is a starting point. We work toward meaningful conversations
          and bookings that can be measured.
        </p>
      </div>
    </section>
  );
}
