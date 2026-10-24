import Link from "next/link";
import { HeroCaptions } from "@/components/homepage/hero-captions";
import { HeroOrbits } from "@/components/homepage/hero-orbits";
import { HeroVisual } from "@/components/homepage/hero-visual";

export default function HomePage() {
  return (
    <main className="homepage-hero relative flex min-h-svh flex-col overflow-hidden bg-white text-neutral-950">
      <header className="relative z-20 px-7 pt-7 sm:px-10">
        <Link href="/" className="inline-flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[0.22em] text-neutral-950">
            JACITA
          </span>
          <span className="mt-1 text-[10px] font-medium tracking-[0.38em] text-neutral-400">
            MARKETING
          </span>
        </Link>
      </header>

      <HeroVisual />
      <HeroOrbits />
      <HeroCaptions />

      <div className="relative z-10 mx-auto flex w-full max-w-[40rem] flex-1 flex-col items-center justify-center px-6 pb-20 pt-6 text-center sm:px-10">
        <p className="text-[11px] font-medium tracking-[0.32em] text-neutral-400">
          AI MARKETING AUTOMATION
        </p>
        <h1 className="mt-5 text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.045em] text-neutral-950 sm:text-5xl md:text-[3.65rem]">
          Your AI marketing
          <br />
          team, running
          <br />
          <span className="bg-gradient-to-r from-[#2f6bff] to-[#c43bff] bg-clip-text text-transparent">
            continuously.
          </span>
        </h1>
        <p className="mt-6 max-w-[28rem] text-[15px] leading-relaxed text-neutral-500 sm:text-base">
          AI creates your content, selects the right media, schedules it,
          publishes across your social channels, and learns what works next.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center rounded-full bg-neutral-950 px-6 text-[15px] font-medium text-white transition-opacity hover:opacity-85"
          >
            Start free
            <span aria-hidden className="ml-1.5">
              →
            </span>
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-full border border-neutral-200 bg-white px-6 text-[15px] font-medium text-neutral-950 transition-colors hover:bg-neutral-50"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
