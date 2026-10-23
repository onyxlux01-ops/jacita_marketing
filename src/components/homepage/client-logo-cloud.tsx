"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ClientLogo } from "@/content/client-logos";
import styles from "./client-logo-cloud.module.css";

const LOGOS_PER_SET = 5;

export function ClientLogoCloud({ logos }: { logos: ClientLogo[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeSet, setActiveSet] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rotationPaused, setRotationPaused] = useState(false);
  const setCount = Math.ceil(logos.length / LOGOS_PER_SET);
  const logosPerSet = Math.ceil(logos.length / Math.max(1, setCount));
  const sets = Array.from({ length: setCount }, (_, index) =>
    logos.slice(index * logosPerSet, (index + 1) * logosPerSet),
  );

  useEffect(() => {
    if (
      !sectionRef.current ||
      sets.length < 2 ||
      !("IntersectionObserver" in window)
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [sets.length]);

  useEffect(() => {
    if (!inView || paused || rotationPaused || sets.length < 2) return;
    const interval = window.setInterval(() => {
      if (
        !document.hidden &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setActiveSet((current) => (current + 1) % sets.length);
      }
    }, 4800);
    return () => window.clearInterval(interval);
  }, [inView, paused, rotationPaused, sets.length]);

  const visibleLogos = sets[activeSet % Math.max(1, sets.length)] ?? [];

  return (
    <section
      ref={sectionRef}
      aria-labelledby="client-showcase-title"
      className={`relative isolate overflow-hidden border-t border-neutral-100 bg-[#f8f9fb] px-6 py-20 sm:px-10 sm:py-24 ${styles.section}`}
    >
      <div aria-hidden className={styles.glow} />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-[40rem] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#756a96]">
            The people behind the posts
          </p>
          <h2
            id="client-showcase-title"
            className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-neutral-950 sm:text-4xl"
          >
            Every brand has a story worth growing.
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-500 sm:text-base">
            A place for the businesses we work with, in their own words and
            identities.
          </p>
        </div>

        {logos.length ? (
          <div
            className="mt-12 sm:mt-14"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            <ul
              className="flex flex-wrap justify-center gap-3 sm:gap-4"
              aria-label="Client brands"
            >
              {visibleLogos.map((logo, index) => (
                <li
                  key={`${activeSet}-${logo.name}`}
                  className={`${styles.logoCard} flex h-28 w-[calc(50%-0.375rem)] items-center justify-center rounded-3xl border border-white bg-white/65 px-6 shadow-[0_16px_46px_rgba(36,41,73,0.045)] backdrop-blur-md sm:h-32 sm:w-[calc(33.333%-0.667rem)] lg:w-[calc(20%-0.8rem)]`}
                >
                  <Image
                    src={logo.src}
                    alt={`${logo.name} logo`}
                    width={170}
                    height={70}
                    className="max-h-16 w-auto max-w-full object-contain"
                    style={{ animationDelay: `${index * 75}ms` }}
                  />
                </li>
              ))}
            </ul>
            {sets.length > 1 && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  aria-pressed={rotationPaused}
                  onClick={() => setRotationPaused((current) => !current)}
                  className="min-h-11 rounded-full border border-neutral-300 px-5 text-sm text-neutral-700 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-700"
                >
                  {rotationPaused
                    ? "Resume client logos"
                    : "Pause client logos"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto mt-11 max-w-lg rounded-[2rem] border border-white bg-white/60 px-8 py-8 text-center shadow-[0_20px_70px_rgba(36,41,73,0.05)] backdrop-blur-md">
            <div aria-hidden className="mx-auto flex w-fit items-center gap-2">
              <span className={`${styles.emptyMark} bg-[#2f6bff]/12`} />
              <span className={`${styles.emptyMark} bg-[#8c62e7]/12`} />
              <span className={`${styles.emptyMark} bg-[#c43bff]/12`} />
            </div>
            <p className="mt-5 text-sm leading-6 text-neutral-500">
              Client identities will appear here with their permission.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
