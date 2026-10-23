"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined, Database } from "lucide-react";
import type { Metric } from "@/lib/dashboard/overview";
import {
  periodComparison,
  metricTotal,
  metricValue,
  type MetricKey,
} from "@/lib/dashboard/metrics";

const SOURCES = [
  { value: "live", label: "Provider data" },
  { value: "manual", label: "Manual entries" },
  { value: "demo", label: "Sample data" },
];
const METRICS: { key: MetricKey; label: string }[] = [
  { key: "reach", label: "Reach" },
  { key: "engagement", label: "Engagements" },
  { key: "enquiries", label: "Enquiries" },
  { key: "bookings", label: "Recorded bookings" },
];

export function PerformancePanel({
  metrics,
  from,
  to,
  days,
  timezone,
}: {
  metrics: Metric[];
  from: string;
  to: string;
  days: number;
  timezone: string;
}) {
  const [platform, setPlatform] = useState("instagram");
  const [source, setSource] = useState("live");
  const [metric, setMetric] = useState<MetricKey>("reach");
  const [point, setPoint] = useState<number | null>(null);
  const gradient = useId().replaceAll(":", "");
  const scoped = metrics.filter(
    (r) => r.platform === platform && r.source === source,
  );
  const current = scoped.filter(
    (r) => r.metric_date >= from && r.metric_date <= to,
  );
  const previous = scoped.filter((r) => r.metric_date < from);
  const metricLabel =
    metric === "reach" && platform === "tiktok"
      ? "Video views"
      : METRICS.find((m) => m.key === metric)!.label;
  const points = Array.from({ length: days }, (_, i) => {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      value: metricTotal(
        current.filter((r) => r.metric_date === key),
        metric,
      ),
    };
  });
  const maximum = Math.max(4, ...points.map((p) => p.value ?? 0));
  const x = (i: number) => 52 + (i / Math.max(days - 1, 1)) * 740;
  const y = (v: number) => 192 - (v / maximum) * 152;
  // Missing days break the line: absence of a measurement is not zero.
  const line = points
    .map((p, i) =>
      p.value === null
        ? ""
        : `${i === 0 || points[i - 1].value === null ? "M" : "L"}${x(i)},${y(p.value)}`,
    )
    .join(" ");
  const segments: number[][] = [];
  points.forEach((p, i) => {
    if (p.value !== null) {
      if (i === 0 || points[i - 1].value === null) segments.push([]);
      segments.at(-1)!.push(i);
    }
  });
  const area = segments
    .map(
      (indexes) =>
        `M${x(indexes[0])},192 ${indexes.map((i) => `L${x(i)},${y(points[i].value!)}`).join(" ")} L${x(indexes.at(-1)!)},192 Z`,
    )
    .join(" ");
  const lastSync = current
    .map((r) => r.updated_at)
    .sort()
    .at(-1);
  const number = (value: number | null) =>
    value === null ? "—" : value.toLocaleString("en-GB");
  const dateLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const selected = point === null ? null : points[point];

  return (
    <section
      className="glass-panel performance-panel"
      aria-labelledby="performance-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Measure what matters</p>
          <h2 id="performance-title">Performance overview</h2>
        </div>
        <Link
          href="/app/analytics"
          className="icon-link"
          aria-label="Open analytics"
        >
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="performance-filters">
        <label>
          <span className="sr-only">Platform</span>
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPoint(null);
            }}
          >
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Data source</span>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPoint(null);
            }}
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="data-note">
          <Database size={12} />{" "}
          {source === "demo" ? "Sample · illustrative only" : "Stored records"}
        </span>
      </div>
      <div className="chart-tabs" role="group" aria-label="Performance metric">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={metric === m.key}
            onClick={() => {
              setMetric(m.key);
              setPoint(null);
            }}
          >
            <span>
              {m.key === "reach" && platform === "tiktok"
                ? "Video views"
                : m.label}
            </span>
            <strong>{number(metricTotal(current, m.key))}</strong>
          </button>
        ))}
      </div>
      <div className="chart-meta">
        <span className="chart-legend">
          <i /> {metricLabel} · {platform}
        </span>
        <span>
          {periodComparison(current, previous, metric, days)}
        </span>
      </div>
      {current.some((r) => metricValue(r, metric) !== null) ? (
        <div className="chart-wrap">
          <svg
            viewBox="0 0 830 230"
            role="img"
            aria-label={`${metricLabel} from ${from} to ${to}. Use the daily value controls below for exact values.`}
          >
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="#2AC2A8" stopOpacity=".24" />
                <stop offset="1" stopColor="#2AC2A8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1="52"
                  x2="792"
                  y1={y(maximum * fraction)}
                  y2={y(maximum * fraction)}
                  stroke="currentColor"
                  strokeDasharray="3 6"
                  opacity=".13"
                />
                <text
                  x="42"
                  y={y(maximum * fraction) + 4}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="10"
                >
                  {Math.round(maximum * fraction).toLocaleString("en-GB")}
                </text>
              </g>
            ))}
            <path d={area} fill={`url(#${gradient})`} />
            <path
              d={line}
              fill="none"
              stroke="#2AC2A8"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {points.map((p, i) =>
              p.value !== null ? (
                <circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={point === i ? 5 : 2.5}
                  fill="#2AC2A8"
                />
              ) : null,
            )}
            {[0, Math.floor((days - 1) / 2), days - 1].map((i) => (
              <text
                key={i}
                x={x(i)}
                y="219"
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
              >
                {dateLabel(points[i].date)}
              </text>
            ))}
          </svg>
          <div className="chart-hits" role="group" aria-label="Daily values. Use left and right arrow keys to move between dates.">
            {points.map((p, i) => (
              <button
                key={p.date}
                aria-label={`${p.date}: ${metricLabel} ${number(p.value)}`}
                tabIndex={i === (point ?? 0) ? 0 : -1}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, i + (event.key === "ArrowRight" ? 1 : -1)));
                  event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
                }}
                onFocus={() => setPoint(i)}
                onBlur={() => setPoint(null)}
                onMouseEnter={() => setPoint(i)}
                onMouseLeave={() => setPoint(null)}
                onClick={() => setPoint(point === i ? null : i)}
              />
            ))}
          </div>
          {selected && (
            <output className="chart-tooltip">
              {dateLabel(selected.date)} · {metricLabel}:{" "}
              <strong>{number(selected.value)}</strong>
            </output>
          )}
          <details className="metric-table">
            <summary>View daily values</summary>
            <table>
              <caption>
                {metricLabel} · {platform} · {source}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date}>
                    <th scope="row">{p.date}</th>
                    <td>{number(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ) : (
        <div className="chart-empty">
          <div className="empty-orbit">
            <ChartNoAxesCombined size={26} />
          </div>
          <strong>
            No{" "}
            {source === "live"
              ? "provider"
              : source === "demo"
                ? "sample"
                : "manual"}{" "}
            {metricLabel.toLowerCase()} yet
          </strong>
          <p>
            {source === "live"
              ? "Connect an account and sync supported metrics to start measuring performance."
              : "No records match this platform and reporting period."}
          </p>
          <Link href="/app/social">
            Manage connections <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
      <div className="chart-footer">
        <span>
          {from} — {to} · {timezone}
        </span>
        <span>
          Last record update:{" "}
          {lastSync
            ? new Date(lastSync).toLocaleString("en-GB", {
                timeZone: timezone,
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "not available"}
        </span>
        {source === "live" && <span>Provider sync time: not recorded</span>}
      </div>
      <p className="metric-caveat">
        {metric === "bookings"
          ? "Recorded totals do not verify a confirmed booking outcome or a sale."
          : metric === "reach"
            ? "Daily reach may include returning people. TikTok views are kept separate from reach."
            : metric === "engagement"
              ? "Engagements = likes + comments + shares + saves; platform definitions vary."
              : "Enquiries are stored enquiry counts; link clicks are excluded."}
      </p>
    </section>
  );
}
