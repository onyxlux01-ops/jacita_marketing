import type { DateRange, DateRangePreset } from "@/lib/analytics/types";

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function resolveDateRange(
  preset: DateRangePreset = "30d",
  customStart?: string | null,
  customEnd?: string | null
): DateRange {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);

  if (preset === "custom" && customStart && customEnd) {
    return {
      start: customStart,
      end: customEnd,
      preset: "custom",
      label: `${customStart} → ${customEnd}`,
    };
  }

  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  start.setDate(end.getDate() - (days - 1));

  return {
    start: toDateString(start),
    end: toDateString(end),
    preset: preset === "custom" ? "30d" : preset,
    label:
      preset === "7d"
        ? "Last 7 days"
        : preset === "90d"
          ? "Last 90 days"
          : "Last 30 days",
  };
}

/** Previous period of equal length immediately before `range`. */
export function previousPeriod(range: DateRange): DateRange {
  const start = new Date(range.start + "T00:00:00Z");
  const end = new Date(range.end + "T00:00:00Z");
  const days =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return {
    start: toDateString(prevStart),
    end: toDateString(prevEnd),
    preset: "custom",
    label: "Previous period",
  };
}

export function weekRangeEnding(endDate = new Date()): DateRange {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return {
    start: toDateString(start),
    end: toDateString(end),
    preset: "7d",
    label: "This week",
  };
}

/**
 * Safe percentage change. Returns null when baseline is 0/null and current is also 0,
 * or when either value is null/undefined. If baseline is 0 and current > 0, returns 100.
 */
export function percentChange(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function formatPercentChange(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}
