"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Metric } from "@/lib/dashboard/overview";
import { metricTotal } from "@/lib/dashboard/metrics";

export function OutcomesPanel({
  metrics,
  from,
  to,
  campaigns,
}: {
  metrics: Metric[];
  from: string;
  to: string;
  campaigns: { id: string; name: string }[];
}) {
  const [platform, setPlatform] = useState("instagram");
  const [source, setSource] = useState("live");
  const rows = metrics.filter(
    (r) =>
      r.platform === platform &&
      r.source === source &&
      r.metric_date >= from &&
      r.metric_date <= to,
  );
  const enquiries = metricTotal(rows, "enquiries");
  const bookings = metricTotal(rows, "bookings");
  const attributed = [
    ...new Set(rows.map((r) => r.campaign_id).filter(Boolean)),
  ];
  return (
    <section className="glass-panel outcomes-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Beyond the click</p>
          <h2>Enquiries & bookings</h2>
        </div>
        <ArrowUpRight size={18} className="text-muted-foreground" />
      </div>
      <div className="performance-filters">
        <label>
          <span className="sr-only">Outcome platform</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Outcome source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="live">Provider data</option>
            <option value="manual">Manual entries</option>
            <option value="demo">Sample data</option>
          </select>
        </label>
      </div>
      <div className="outcome-values">
        <div>
          <span>Enquiries</span>
          <strong>{enquiries?.toLocaleString("en-GB") ?? "—"}</strong>
        </div>
        <div>
          <span>Recorded bookings</span>
          <strong>{bookings?.toLocaleString("en-GB") ?? "—"}</strong>
        </div>
      </div>
      <div className="attribution-row">
        <span>Confirmed bookings</span>
        <strong>Not verified</strong>
      </div>
      <p className="metric-caveat">
        {source === "demo"
          ? "Sample records are illustrative, not business results. "
          : ""}
        {rows.length
          ? "Stored counts do not verify a confirmed booking outcome or connect a sale to a post."
          : "No outcome records for this platform, source and period. A click is not an enquiry."}
      </p>
      <div className="attribution-row">
        <span>Campaign attribution</span>
        <strong>
          {attributed.length
            ? attributed
                .map(
                  (id) =>
                    campaigns.find((c) => c.id === id)?.name ??
                    "Linked campaign",
                )
                .join(", ")
            : "Unknown"}
        </strong>
      </div>
      {rows.some((r) => !r.campaign_id) && (
        <p className="metric-caveat">Some records have unknown attribution.</p>
      )}
      <Link href="/app/campaigns" className="panel-bottom-link">
        Review campaign briefs <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}
