"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/lib/analytics";

const TABS: Array<{ id: DateRangePreset; label: string }> = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

export function AnalyticsRangeTabs({ current }: { current: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setRange(id: DateRangePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-4 flex rounded-lg bg-muted/80 p-1 w-fit">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setRange(tab.id)}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-sm transition-colors",
            current === tab.id
              ? "bg-card font-medium text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
      <Link
        href="/app/analytics?range=30d"
        className="sr-only"
      >
        Reset
      </Link>
    </div>
  );
}
