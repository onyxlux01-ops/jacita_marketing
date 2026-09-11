import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 12% 18%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 55%),
            radial-gradient(ellipse 55% 40% at 88% 12%, color-mix(in oklab, var(--foreground) 6%, transparent), transparent 50%),
            linear-gradient(165deg, var(--background) 0%, color-mix(in oklab, var(--muted) 70%, var(--background)) 100%)
          `,
        }}
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16 sm:px-10">
        <p className="font-heading text-5xl font-semibold tracking-tight text-foreground sm:text-7xl md:text-8xl">
          Jacita
        </p>
        <h1 className="mt-6 max-w-2xl font-heading text-2xl font-medium leading-snug tracking-tight text-foreground/90 sm:text-3xl md:text-[2.5rem]">
          Your businesses&apos; marketing runs from here.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
          A command centre for multi-brand content, campaigns, and social —
          calm, precise, and built to scale.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-xl px-5">
            <Link href="/signup">Start free</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-xl bg-card/80 px-5"
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
