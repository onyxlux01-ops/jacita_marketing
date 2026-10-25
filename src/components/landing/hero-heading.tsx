"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "./use-media-query";

const words = ["discovered.", "remembered.", "booked."];

export function HeroHeading() {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const [text, setText] = useState(words[0]);
  useEffect(() => {
    if (reducedMotion) return;
    let word = 0,
      count = words[0].length,
      deleting = true;
    let timer: ReturnType<typeof setTimeout>;
    function schedule(delay: number) {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(tick, delay);
    }
    function tick() {
      count += deleting ? -1 : 1;
      setText(words[word].slice(0, count));
      if (deleting && count === 0) {
        word = (word + 1) % words.length;
        deleting = false;
        schedule(300);
      } else if (!deleting && count === words[word].length) {
        deleting = true;
        schedule(1800);
      } else schedule(deleting ? 45 : 90);
    }
    const visibility = () =>
      document.hidden ? clearTimeout(timer) : schedule(600);
    document.addEventListener("visibilitychange", visibility);
    schedule(1800);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [reducedMotion]);
  return (
    <h1
      className={"typing-heading" + (reducedMotion ? "" : " typing-active")}
      aria-label="Be discovered. Be remembered. Be booked."
    >
      <span className="hero-static" aria-hidden="true">
        Be discovered.
        <br />
        Be remembered.
        <br />
        <em>Be booked.</em>
      </span>
      <span className="hero-type" aria-hidden="true">
        Be{" "}
        <span className="typed-word">
          <span>{text}</span>
          <span className="typing-cursor">|</span>
        </span>
      </span>
    </h1>
  );
}
