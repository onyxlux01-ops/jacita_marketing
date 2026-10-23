import type { Metric } from "./overview";

export type MetricKey = "reach" | "engagement" | "enquiries" | "bookings";
export function metricValue(row: Metric, key: MetricKey): number | null {
  if (key === "reach")
    return row.platform === "tiktok" ? row.video_views : row.reach;
  if (key === "engagement")
    return row.likes + row.comments + row.shares + row.saves;
  return row[key];
}

export function metricTotal(rows: Metric[], key: MetricKey): number | null {
  const values = rows
    .map((r) => metricValue(r, key))
    .filter((n): n is number => n !== null);
  return values.length ? values.reduce((sum, n) => sum + n, 0) : null;
}

export function metricChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "No comparison data";
  if (previous === 0)
    return current === 0
      ? "No change vs previous period"
      : "No non-zero baseline";
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}% vs previous period`;
}

export function periodComparison(current: Metric[], previous: Metric[], key: MetricKey, days: number) {
  const coverage = (rows: Metric[]) => new Set(rows.filter((row) => metricValue(row, key) !== null).map((row) => row.metric_date)).size;
  const currentDays = coverage(current);
  const previousDays = coverage(previous);
  if (!currentDays || !previousDays) return "No comparison data";
  if (currentDays < days || previousDays < days) return "Incomplete periods · no comparison";
  return metricChange(metricTotal(current, key), metricTotal(previous, key));
}
