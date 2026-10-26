"use client";

import { useRef, useState } from "react";
import { useMediaQuery } from "./use-media-query";
import styles from "./service-folders.module.css";

const services = [
  {
    title: "Know your business",
    description: "We begin with your services, audience, brand language, approved offers and what success means to you.",
  },
  {
    title: "Make content that fits",
    description: "Ideas, captions, graphics and video are prepared around your real materials, with the right review before publishing.",
  },
  {
    title: "Learn what moves people",
    description: "We look at delivery, engagement, enquiries and bookings where reliable data exists, then improve the next round.",
  },
];

function ServiceIllustration({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 300 220" fill="none" aria-hidden="true" focusable="false">
      {index === 0 ? (
        <>
          <circle cx="150" cy="112" r="92" stroke="#b99a55" strokeOpacity=".4" />
          <circle cx="150" cy="112" r="70" stroke="#fff" strokeOpacity=".45" strokeDasharray="3 8" />
          <g transform="rotate(-8 150 112)">
            <rect x="71" y="43" width="158" height="137" rx="18" fill="#0b2346" stroke="#d7b86e" strokeWidth="2" />
            <rect x="82" y="54" width="136" height="115" rx="12" stroke="#fff" strokeOpacity=".14" />
            <circle cx="115" cy="92" r="17" fill="#e7d4a3" />
            <path d="M91 134c0-15 10-25 24-25s24 10 24 25" fill="#e7d4a3" />
            <path d="M154 86h42m-42 13h30m-30 26h42m-42 12h33" stroke="#dbe7f7" strokeWidth="5" strokeLinecap="round" />
          </g>
          <circle cx="55" cy="127" r="23" fill="#faf7ed" stroke="#b99a55" strokeWidth="2" />
          <circle cx="55" cy="121" r="6" fill="#b99a55" />
          <path d="M43 137c0-7 5-11 12-11s12 4 12 11" fill="#b99a55" />
          <circle cx="248" cy="81" r="25" fill="#faf7ed" stroke="#b99a55" strokeWidth="2" />
          <circle cx="248" cy="74" r="7" fill="#0b2346" />
          <path d="M235 93c0-8 5-12 13-12s13 4 13 12" fill="#0b2346" />
          <path d="m235 149 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#b99a55" />
        </>
      ) : index === 1 ? (
        <>
          <g transform="rotate(12 162 105)">
            <rect x="107" y="28" width="117" height="157" rx="14" fill="#0b2346" stroke="#d6e2f2" strokeWidth="2" />
            <path d="M124 51h65m-65 13h47" stroke="#d5b566" strokeWidth="5" strokeLinecap="round" />
          </g>
          <g transform="rotate(-10 131 112)">
            <rect x="62" y="35" width="137" height="163" rx="14" fill="#fffdf7" stroke="#0b2346" strokeWidth="2" />
            <rect x="76" y="50" width="109" height="75" rx="7" fill="#dce7f5" />
            <circle cx="153" cy="71" r="10" fill="#b99a55" />
            <path d="m77 114 30-35 27 26 16-15 34 34H77z" fill="#0b2346" />
            <path d="M79 143h92m-92 13h78m-78 13h53" stroke="#71859e" strokeWidth="5" strokeLinecap="round" />
          </g>
          <g transform="rotate(8 222 160)">
            <rect x="195" y="137" width="53" height="45" rx="10" fill="#0b2346" stroke="#d5b566" strokeWidth="2" />
            <path d="m217 148 15 11-15 11z" fill="#e4c981" />
          </g>
        </>
      ) : (
        <>
          <g transform="rotate(-7 148 110)">
            <rect x="40" y="37" width="220" height="152" rx="17" fill="#eaf0f8" stroke="#d8b867" strokeWidth="2" />
            <path d="M58 74h183M58 105h183M58 136h183" stroke="#bccbdf" strokeWidth="1" />
            <rect x="71" y="130" width="25" height="39" rx="4" fill="#b1c5de" />
            <rect x="111" y="109" width="25" height="60" rx="4" fill="#809cbe" />
            <rect x="151" y="85" width="25" height="84" rx="4" fill="#3a5c84" />
            <rect x="191" y="61" width="25" height="108" rx="4" fill="#b99a55" />
            <path d="m70 119 48-31 42 2 52-46m-21 0h21v21" stroke="#0b2346" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="118" cy="88" r="5" fill="#fff" stroke="#0b2346" strokeWidth="3" />
            <circle cx="160" cy="90" r="5" fill="#fff" stroke="#0b2346" strokeWidth="3" />
          </g>
          <circle cx="253" cy="177" r="23" fill="#b99a55" stroke="#f3e6c5" strokeWidth="2" />
          <path d="m243 177 7 7 13-15" stroke="#fffdf7" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function ServiceFolders() {
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const pointerType = useRef("mouse");
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className={styles.grid}>
      {services.map((service, index) => {
        const open = reducedMotion || hovered === index || focused === index || selected === index;
        return (
          <article
            key={service.title}
            className={styles.folder}
            data-tone={index}
            data-open={open}
            onPointerEnter={(event) => {
              if (finePointer && event.pointerType === "mouse") {
                setSelected(null);
                setHovered(index);
              }
            }}
            onPointerLeave={() => setHovered(null)}
          >
            <div className={styles.artwork} aria-hidden="true">
              <ServiceIllustration index={index} />
            </div>
            <div className={styles.front} aria-hidden="true">
              <svg viewBox="0 0 320 44" preserveAspectRatio="none">
                <path d="M0 28C0 12 12 0 28 0H76C85 0 89 2 96 9L112 23C117 28 121 30 130 30H292C309 30 320 40 320 56V64H0Z" fill="currentColor" />
              </svg>
            </div>
            <span className={styles.number} aria-hidden="true">0{index + 1}</span>
            <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className={styles.copy}>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </div>
            <button
              type="button"
              className={styles.toggle}
              aria-label={`Preview illustration: ${service.title}`}
              aria-pressed={open}
              onPointerDown={(event) => {
                pointerType.current = event.pointerType;
                if (event.pointerType !== "mouse") {
                  setHovered(null);
                  setFocused(null);
                }
              }}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) setFocused(index);
              }}
              onBlur={() => setFocused(null)}
              onClick={(event) => {
                if (event.detail === 0) setFocused(focused === index ? null : index);
                else if (!finePointer || pointerType.current !== "mouse") setSelected(selected === index ? null : index);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setHovered(null);
                  setFocused(null);
                  setSelected(null);
                }
              }}
            />
          </article>
        );
      })}
    </div>
  );
}
