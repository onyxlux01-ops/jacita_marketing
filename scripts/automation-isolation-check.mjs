/**
 * Multi-business automation isolation:
 * Hair salon vs Restaurant — settings/runs/activity/content stay separate.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const email = `auto-${stamp}@example.com`;
const password = "TestPass123!";

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) throw createErr;
const user = created.user;

const client = createClient(url, anon, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: signErr } = await client.auth.signInWithPassword({
  email,
  password,
});
if (signErr) throw signErr;

async function seed(name, slug, category, serviceName, goal) {
  const { data: orgId, error } = await client.rpc("create_organisation", {
    p_name: name,
    p_slug: slug,
    p_business_category: category,
    p_description: `${name} automation isolation test`,
    p_location: "London",
  });
  if (error) throw error;

  await client
    .from("organisations")
    .update({ primary_marketing_goal_key: goal })
    .eq("id", orgId);

  await client.from("products_services").insert({
    organisation_id: orgId,
    name: serviceName,
    description: `${serviceName} offering`,
    is_active: true,
    is_featured: true,
  });

  await client.from("media_assets").insert({
    organisation_id: orgId,
    storage_path: `${orgId}/auto-test.jpg`,
    file_name: "auto-test.jpg",
    media_type: "image",
    mime_type: "image/jpeg",
    is_active: true,
  });

  // Ensure automation_settings row (migration seed or insert)
  const { error: settingsErr } = await client.from("automation_settings").upsert({
    organisation_id: orgId,
    enabled: true,
    paused: false,
    mode: "approval",
    posts_per_week: 3,
    reels_per_week: 1,
    platforms: ["instagram"],
    content_preferences: ["educational", "services"],
    primary_goals: [goal],
    current_state: "completed",
    setup_completed_at: new Date().toISOString(),
  });
  if (settingsErr) throw settingsErr;

  const { data: run, error: runErr } = await client
    .from("automation_runs")
    .insert({
      organisation_id: orgId,
      trigger: "manual",
      status: "completed",
      actions_taken: 1,
      summary: `Isolation run for ${name}`,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr) throw runErr;

  await client.from("automation_activity").insert({
    organisation_id: orgId,
    run_id: run.id,
    event_type: "content_created",
    message: `AI created Instagram post for ${serviceName}`,
    severity: "success",
  });

  await client.from("content").insert({
    organisation_id: orgId,
    title: `${serviceName} spotlight`,
    hook: `Only for ${name}`,
    caption: `Promote ${serviceName} at ${name}`,
    status: "review",
    content_type: "service_spotlight",
    marketing_objective: goal,
    created_by: user.id,
  });

  return { orgId, runId: run.id, serviceName, name };
}

const salon = await seed(
  `Salon Auto ${stamp}`,
  `salon-auto-${stamp}`,
  "Hair salon",
  "Box braids",
  "promote_service"
);
const restaurant = await seed(
  `Bistro Auto ${stamp}`,
  `bistro-auto-${stamp}`,
  "Restaurant",
  "Weekend brunch",
  "increase_brand_awareness"
);

const failures = [];

const { data: salonSettings } = await admin
  .from("automation_settings")
  .select("organisation_id, primary_goals, mode")
  .eq("organisation_id", salon.orgId)
  .single();
const { data: restSettings } = await admin
  .from("automation_settings")
  .select("organisation_id, primary_goals, mode")
  .eq("organisation_id", restaurant.orgId)
  .single();

if (salonSettings?.organisation_id !== salon.orgId) {
  failures.push("salon settings missing");
}
if (restSettings?.organisation_id !== restaurant.orgId) {
  failures.push("restaurant settings missing");
}
if (
  JSON.stringify(salonSettings?.primary_goals) ===
  JSON.stringify(restSettings?.primary_goals)
) {
  // goals intentionally different — if equal, contamination or seed bug
  failures.push("goals unexpectedly identical");
}

const { data: salonActivity } = await admin
  .from("automation_activity")
  .select("message, organisation_id")
  .eq("organisation_id", salon.orgId);
const { data: restActivity } = await admin
  .from("automation_activity")
  .select("message, organisation_id")
  .eq("organisation_id", restaurant.orgId);

if ((salonActivity ?? []).some((a) => a.message.includes("brunch"))) {
  failures.push("restaurant message leaked into salon activity");
}
if ((restActivity ?? []).some((a) => a.message.includes("braids"))) {
  failures.push("salon message leaked into restaurant activity");
}

const { data: salonContent } = await admin
  .from("content")
  .select("id, title, organisation_id")
  .eq("organisation_id", salon.orgId);
const { data: restContent } = await admin
  .from("content")
  .select("id, title, organisation_id")
  .eq("organisation_id", restaurant.orgId);

if ((salonContent ?? []).some((c) => c.title?.includes("brunch"))) {
  failures.push("restaurant content under salon org");
}
if ((restContent ?? []).some((c) => c.title?.includes("braids"))) {
  failures.push("salon content under restaurant org");
}

const { count: crossRuns } = await admin
  .from("automation_runs")
  .select("*", { count: "exact", head: true })
  .eq("organisation_id", salon.orgId)
  .eq("id", restaurant.runId);

if ((crossRuns ?? 0) > 0) {
  failures.push("restaurant run visible under salon filter");
}

// Cleanup
await admin.from("organisations").delete().eq("id", salon.orgId);
await admin.from("organisations").delete().eq("id", restaurant.orgId);
await admin.auth.admin.deleteUser(user.id);

const ok = failures.length === 0;
console.log(
  JSON.stringify(
    {
      ok,
      failures,
      salon: { orgId: salon.orgId, goals: salonSettings?.primary_goals },
      restaurant: {
        orgId: restaurant.orgId,
        goals: restSettings?.primary_goals,
      },
    },
    null,
    2
  )
);

if (!ok) process.exit(1);
