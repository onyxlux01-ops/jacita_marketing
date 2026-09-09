import Link from "next/link";
import type { SetupProgress } from "@/lib/org/setup-progress";

export function SetupChecklist({ progress }: { progress: SetupProgress }) {
  if (progress.completed && progress.completeCount >= progress.totalRequired) {
    return null;
  }

  const incomplete = progress.items.filter((i) => i.status !== "complete");
  if (!incomplete.length) return null;

  return (
    <section className="jacita-enter jacita-enter-delay-2 rounded-xl border border-border/70 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Your marketing setup
          </p>
          <p className="mt-1 font-heading text-base font-semibold">
            {progress.completeCount}/{progress.totalRequired} required complete
          </p>
        </div>
        <Link
          href="/app/onboarding/setup"
          className="text-sm font-medium text-primary hover:underline"
        >
          Complete setup
        </Link>
      </div>
      <ul className="mt-4 space-y-2">
        {progress.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              {item.status === "complete" ? "✓" : "⚠"} {item.label}
            </span>
            <span className="text-xs text-muted-foreground">{item.detail}</span>
            {item.status !== "complete" ? (
              <Link
                href={item.href}
                className="text-xs font-medium text-primary hover:underline"
              >
                {item.id === "media"
                  ? "Upload media"
                  : item.id === "social"
                    ? "Connect accounts"
                    : "Continue"}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
