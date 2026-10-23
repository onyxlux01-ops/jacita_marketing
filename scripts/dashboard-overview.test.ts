import assert from "node:assert/strict";
import { test } from "node:test";
import { getOverview } from "../src/lib/dashboard/overview";
import { metricChange, metricTotal, periodComparison } from "../src/lib/dashboard/metrics";
import type { Metric } from "../src/lib/dashboard/overview";

type Call = {
  table: string;
  select: string;
  options?: { head?: boolean; count?: string };
  filters: Array<[string, ...unknown[]]>;
  offset: number;
};
function database(failTable?: string) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, select: "", filters: [], offset: 0 };
      const query = {
        select(select: string, options?: Call["options"]) {
          call.select = select;
          call.options = options;
          return query;
        },
        eq(...args: unknown[]) {
          call.filters.push(["eq", ...args]);
          return query;
        },
        in(...args: unknown[]) {
          call.filters.push(["in", ...args]);
          return query;
        },
        not(...args: unknown[]) {
          call.filters.push(["not", ...args]);
          return query;
        },
        gte(...args: unknown[]) {
          call.filters.push(["gte", ...args]);
          return query;
        },
        lte(...args: unknown[]) {
          call.filters.push(["lte", ...args]);
          return query;
        },
        lt(...args: unknown[]) {
          call.filters.push(["lt", ...args]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        single() {
          return query;
        },
        maybeSingle() {
          return query;
        },
        range(offset: number) {
          call.offset = offset;
          return query;
        },
        then(resolve: (value: unknown) => void) {
          calls.push(call);
          let data: unknown = [];
          if (table === "organisations") data = { timezone: "Europe/London" };
          if (table === "brand_profiles")
            data = { logo_path: "brand/logo.png" };
          if (table === "automation_settings") data = null;
          if (table === "analytics_metrics")
            data =
              call.offset === 0
                ? Array.from({ length: 500 }, (_, id) => ({ id: String(id) }))
                : [{ id: "501" }];
          if (table === "ai_usage")
            data = [
              { actual_cost_pence: 2, estimated_cost_pence: 5 },
              { actual_cost_pence: null, estimated_cost_pence: 3 },
            ];
          const fail =
            table === failTable ||
            (failTable === "held-only" &&
              table === "social_publish_jobs" &&
              call.filters.some((f) => f[1] === "status" && f[2] === "held"));
          resolve({
            data,
            count: 125,
            error: fail ? { message: "Disconnected" } : null,
          });
        },
      };
      return query;
    },
  };
  return { db: db as unknown as Parameters<typeof getOverview>[0], calls };
}

test("overview keeps all queries in the selected business, uses exact counts and paginates", async () => {
  const { db, calls } = database();
  const result = await getOverview(db, "business-A", 7);
  for (const call of calls)
    assert.ok(
      call.filters.some(
        (f) =>
          f[0] === "eq" &&
          f[1] ===
            (call.table === "organisations" ? "id" : "organisation_id") &&
          f[2] === "business-A",
      ),
      `${call.table} lacks business scope`,
    );
  assert.equal(result.totals.review, 125);
  assert.equal(result.metrics.length, 501);
  assert.deepEqual(result.costs, {
    available: true,
    count: 2,
    calculated: 2,
    estimated: 3,
    unsettled: 1,
  });
  const publication = calls.find(
    (c) => c.table === "social_publish_jobs" && c.options?.head,
  );
  assert.ok(
    publication?.filters.some(
      (f) => f[0] === "eq" && f[1] === "simulated" && f[2] === false,
    ),
  );
  assert.ok(
    publication?.filters.some(
      (f) => f[0] === "eq" && f[1] === "status" && f[2] === "published",
    ),
  );
  assert.ok(
    publication?.filters.some(
      (f) => f[0] === "not" && f[1] === "external_post_id",
    ),
  );
  assert.ok(calls.some((c) => c.select.includes("social_publish_jobs!inner")));
});

test("a failed read cannot become a misleading empty success", async () => {
  const { db } = database("analytics_metrics");
  await assert.rejects(
    getOverview(db, "business-A", 7),
    /Performance records could not be loaded/,
  );
});

test("an unavailable optional cost table does not hide working content and analytics", async () => {
  const { db } = database("ai_usage");
  const result = await getOverview(db, "business-A", 7);
  assert.equal(result.costs.available, false);
  assert.equal(result.totals.review, 125);
  assert.equal(result.metrics.length, 501);
});

test("older backends without the held enum keep working and flag unavailable hold tracking", async () => {
  const { db } = database("held-only");
  const result = await getOverview(db, "business-A", 7);
  assert.equal(result.holdsAvailable, false);
  assert.equal(result.heldCount, null);
  assert.equal(result.publications, 125);
});

const row = {
  platform: "instagram",
  reach: 100,
  video_views: 900,
  likes: 3,
  comments: 2,
  shares: 1,
  saves: 4,
  enquiries: null,
  bookings: 0,
} as Metric;
test("missing outcomes stay unknown and views do not stand in for reach", () => {
  assert.equal(metricTotal([], "enquiries"), null);
  assert.equal(metricTotal([row], "enquiries"), null);
  assert.equal(metricTotal([row], "bookings"), 0);
  assert.equal(metricTotal([row], "reach"), 100);
  assert.equal(metricTotal([{ ...row, platform: "tiktok" }], "reach"), 900);
  assert.equal(
    metricTotal([{ ...row, platform: "tiktok", video_views: null }], "reach"),
    null,
  );
  assert.equal(metricTotal([row], "engagement"), 10);
});
test("comparison needs a recorded, non-zero baseline", () => {
  assert.equal(metricChange(10, null), "No comparison data");
  assert.equal(metricChange(10, 0), "No non-zero baseline");
  assert.equal(metricChange(10, 5), "+100.0% vs previous period");
  assert.equal(periodComparison([{...row, metric_date: "2026-10-23"}], [{...row, metric_date: "2026-10-16"}], "reach", 7), "Incomplete periods · no comparison");
});
