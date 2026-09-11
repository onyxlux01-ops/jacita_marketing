"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  function setRange(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={current} onValueChange={setRange} className="mt-4">
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="px-3.5">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <Link href="/app/analytics?range=30d" className="sr-only">
        Reset
      </Link>
    </Tabs>
  );
}
