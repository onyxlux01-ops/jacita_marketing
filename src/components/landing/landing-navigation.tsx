"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useMediaQuery } from "./use-media-query";

const navigation = [
  ["#services", "What we do"],
  ["#how", "How it works"],
  ["#results", "Outcomes"],
  ["#faq", "FAQs"],
] as const;

export function EyeLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  function aim(event: PointerEvent<HTMLAnchorElement>) {
    if (reducedMotion || event.pointerType !== "mouse") return;
    event.currentTarget.querySelectorAll<HTMLElement>(".eye").forEach((eye) => {
      const rect = eye.getBoundingClientRect();
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      const angle = Math.atan2(dy, dx);
      const distance = Math.min(6, Math.hypot(dx, dy) * 0.12);
      eye.style.setProperty("--px", Math.cos(angle) * distance + "px");
      eye.style.setProperty("--py", Math.sin(angle) * distance + "px");
    });
  }
  return (
    <a
      className="pill dark eye-cta"
      href={href}
      onPointerMove={aim}
      onPointerLeave={(event) =>
        event.currentTarget
          .querySelectorAll<HTMLElement>(".eye")
          .forEach((eye) => {
            eye.style.setProperty("--px", "0px");
            eye.style.setProperty("--py", "0px");
          })
      }
    >
      {children}
      <span className="eye-pair" aria-hidden="true">
        <span className="eye" />
        <span className="eye" />
      </span>
    </a>
  );
}

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    const desktop = window.matchMedia("(min-width:981px)");
    const resize = () => {
      if (desktop.matches) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", resize);
    };
  }, [open]);
  return (
    <header className="topbar container">
      <a href="#top" className="brand" aria-label="JACITA Marketing home" />
      <nav className="navlinks" aria-label="Main navigation">
        {navigation.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <div className="nav-right">
        <Link className="signin" href="/login">
          Sign in
        </Link>
        <EyeLink href="#contact">Discuss your business</EyeLink>
        <button
          className="menu"
          type="button"
          ref={menuButton}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-controls="landing-mobile-nav"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          ☰
        </button>
      </div>
      <nav
        className="mobile-nav"
        id="landing-mobile-nav"
        aria-label="Mobile navigation"
        hidden={!open}
      >
        {navigation.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setOpen(false)}>
            {label}
          </a>
        ))}
        <a href="#contact" onClick={() => setOpen(false)}>
          Discuss your business
        </a>
        <Link href="/login" onClick={() => setOpen(false)}>
          Sign in
        </Link>
      </nav>
    </header>
  );
}
