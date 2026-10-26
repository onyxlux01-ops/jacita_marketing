"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type MouseEvent,
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
  return (
    <a className="pill dark eye-cta" href={href}>
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
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const menu = dialog.current;
    if (!open || !menu) return;
    const previousOverflow = document.body.style.overflow;
    menu.classList.remove("closing");
    menu.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(closeTimer.current);
      menu.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  function closeMenu(target?: string) {
    if (dialog.current?.classList.contains("closing")) return;
    dialog.current?.classList.add("closing");
    closeTimer.current = setTimeout(
      () => {
        dialog.current?.close();
        setOpen(false);
        if (target) {
          history.replaceState(null, "", target);
          document.querySelector(target)?.scrollIntoView({
            behavior: reducedMotion ? "instant" : "smooth",
          });
        }
      },
      reducedMotion ? 0 : 500,
    );
  }
  function followSection(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    closeMenu(event.currentTarget.hash);
  }
  return (
    <>
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
          <button
            className="menu"
            type="button"
            aria-label="Open menu"
            aria-controls="landing-site-menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            ☰
          </button>
        </div>
      </header>
      <dialog
        ref={dialog}
        className="site-menu"
        id="landing-site-menu"
        aria-label="JACITA navigation"
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
      >
        <div className="overlay-surface">
          <header className="overlay-header">
            <a href="#top" className="overlay-brand" onClick={followSection}>
              JACITA <small>MARKETING</small>
            </a>
            <button
              type="button"
              className="overlay-close"
              aria-label="Close menu"
              onClick={() => closeMenu()}
              autoFocus
            >
              <span>Close</span>
              <span className="close-symbol" aria-hidden="true">
                ×
              </span>
            </button>
          </header>
          <nav className="overlay-links" aria-label="Main navigation">
            {[...navigation.slice(0, 3), ["#contact", "Let’s talk"]].map(
              ([href, label], index) => (
                <a
                  href={href}
                  key={href}
                  onClick={followSection}
                  style={{ "--order": index } as CSSProperties}
                >
                  <small>0{index + 1}</small>
                  <span>{label}</span>
                </a>
              ),
            )}
          </nav>
          <footer className="overlay-footer">
            <span>Personal marketing, intelligently managed.</span>
            <Link href="/login" onClick={() => setOpen(false)}>
              Sign in ↗
            </Link>
            <a href="#faq" onClick={followSection}>
              Questions &amp; answers ↗
            </a>
          </footer>
        </div>
      </dialog>
    </>
  );
}
