"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";

export function PeriodFilter({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <label className="period-filter">
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <CalendarDays size={14} />
      )}
      <span className="sr-only">Reporting period</span>
      <select
        disabled={pending}
        value={`${days}d`}
        onChange={(event) => {
          const params = new URLSearchParams(search);
          params.set("range", event.target.value);
          startTransition(() => router.push(`${pathname}?${params}`));
        }}
      >
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>
      <span className="sr-only" role="status">
        {pending ? "Loading reporting period" : ""}
      </span>
    </label>
  );
}
