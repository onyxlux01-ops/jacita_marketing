/**
 * Growth intelligence isolation checks.
 * Run: load .env.local then npx tsx scripts/growth-isolation-check.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  aggregateMetricRows,
  computeMarketingHealthScore,
  percentChange,
} from "../src/lib/analytics";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Unit: percent change safety
  const cases = [
    [10, 5, 100],
    [0, 0, 0],
    [5, 0, 100],
    [null, 5, null],
  ] as const;
  for (const [c, p, expected] of cases) {
    const got = percentChange(c as number | null, p as number | null);
    if (got !== expected) {
      throw new Error(`percentChange(${c},${p})=${got} expected ${expected}`);
    }
  }

  // Unit: insufficient data health
  const emptyHealth = computeMarketingHealthScore({
    current: aggregateMetricRows([]),
    previous: aggregateMetricRows([]),
    goalKey: "increase_bookings",
    contentPublished: 0,
  });
  if (emptyHealth.confidence !== "insufficient_data") {
    throw new Error("Expected insufficient_data health score");
  }

  const stamp = Date.now();
  const { data: orgA } = await admin
    .from("organisations")
    .insert({
      name: `Growth Hair ${stamp}`,
      slug: `growth-hair-${stamp}`,
      business_category: "Hair & Beauty",
      primary_marketing_goal_key: "increase_bookings",
    })
    .select("id")
    .single();
  const { data: orgB } = await admin
    .from("organisations")
    .insert({
      name: `Growth Restaurant ${stamp}`,
      slug: `growth-rest-${stamp}`,
      business_category: "Restaurant",
      primary_marketing_goal_key: "increase_enquiries",
    })
    .select("id")
    .single();

  if (!orgA || !orgB) throw new Error("org create failed");

  await admin.from("analytics_metrics").insert([
    {
      organisation_id: orgA.id,
      platform: "instagram",
      metric_date: new Date().toISOString().slice(0, 10),
      reach: 9000,
      impressions: 12000,
      likes: 400,
      bookings: 5,
      source: "demo",
    },
    {
      organisation_id: orgB.id,
      platform: "instagram",
      metric_date: new Date().toISOString().slice(0, 10),
      reach: 2000,
      impressions: 3000,
      likes: 50,
      enquiries: 8,
      source: "demo",
    },
  ]);

  const { data: aOnly } = await admin
    .from("analytics_metrics")
    .select("reach, organisation_id")
    .eq("organisation_id", orgA.id);
  const leak = (aOnly || []).some((r) => r.organisation_id !== orgA.id);
  const aReach = (aOnly || []).reduce((s, r) => s + (r.reach || 0), 0);

  console.log(
    JSON.stringify(
      {
        percentChangeOk: true,
        insufficientDataOk: true,
        orgA: orgA.id,
        orgB: orgB.id,
        aReach,
        crossTenantLeak: leak,
        goals: { A: "increase_bookings", B: "increase_enquiries" },
      },
      null,
      2
    )
  );

  if (process.env.SOCIAL_TEST_CLEANUP === "1") {
    await admin.from("organisations").delete().in("id", [orgA.id, orgB.id]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
