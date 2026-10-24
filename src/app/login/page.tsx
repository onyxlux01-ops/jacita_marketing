import type { Metadata } from "next";
import { Suspense } from "react";
import { HeroCaptions } from "@/components/homepage/hero-captions";
import { HeroOrbits } from "@/components/homepage/hero-orbits";
import { HeroVisual } from "@/components/homepage/hero-visual";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage your JACITA marketing workspace.",
};

export default function LoginPage() {
  return (
    <main className="homepage-hero relative flex min-h-svh flex-col overflow-hidden bg-white text-neutral-950">
      <header className="relative z-20 px-7 pt-7 sm:px-10">
        <a href="/" aria-label="JACITA Marketing home" className="inline-flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[0.22em] text-neutral-950">
            JACITA
          </span>
          <span className="mt-1 text-[10px] font-medium tracking-[0.38em] text-neutral-400">
            MARKETING
          </span>
        </a>
      </header>

      <HeroVisual />
      <HeroOrbits />
      <HeroCaptions />

      <div className="relative z-10 mx-auto flex w-full max-w-[40rem] flex-1 flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
        <p className="text-[11px] font-medium tracking-[0.32em] text-neutral-400">
          YOUR MARKETING WORKSPACE
        </p>
        <h1 className="mt-5 text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.045em] text-neutral-950 sm:text-5xl">
          Welcome back
          <br />
          <span className="bg-gradient-to-r from-[#2f6bff] to-[#c43bff] bg-clip-text text-transparent">
            to JACITA.
          </span>
        </h1>
        <p className="mt-6 max-w-[28rem] text-[15px] leading-relaxed text-neutral-500 sm:text-base">
          Sign in to manage your campaigns, content, and social channels.
        </p>
        <div className="mt-8 w-full max-w-sm space-y-5 text-left">
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
            <LoginForm />
          </Suspense>
        </div>
        <a href="/" className="mt-6 text-sm text-neutral-600 underline-offset-4 hover:underline">
          Back to JACITA Marketing
        </a>
      </div>
    </main>
  );
}
