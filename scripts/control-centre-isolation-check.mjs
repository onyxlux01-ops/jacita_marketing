/**
 * Control centre data isolation: salon vs restaurant queries stay scoped.
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
const email = `cc-${stamp}@example.com`;
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
await client.auth.signInWithPassword({ email, password });

async function seed(name, slug, category, decision) {
  const { data: orgId, error } = await client.rpc("create_organisation", {
    p_name: name,
    p_slug: slug,
    p_business_category: category,
    p_description: `${name} control centre test`,
    p_location: "London",
  });
  if (error) throw error;

  await client.from("automation_settings").upsert({
    organisation_id: orgId,
    enabled: true,
    paused: false,
    mode: "approval",
    ai_freedom_level: "balanced",
    latest_decision: decision,
    next_planned_action: `Next for ${name}`,
    setup_completed_at: new Date().toISOString(),
    current_state: "completed",
  });

  await client.from("automation_activity").insert({
    organisation_id: orgId,
    event_type: "learning",
    message: `Learning only for ${name}`,
    severity: "success",
  });

  await client.from("content").insert({
    organisation_id: orgId,
    title: `${name} approval item`,
    hook: `Hook ${name}`,
    status: "review",
    created_by: user.id,
  });

  return orgId;
}

const salonId = await seed(
  `CC Salon ${stamp}`,
  `cc-salon-${stamp}`,
  "Hair salon",
  {
    decision: "More braiding reels",
    why: "Salon evidence",
    action: "Increase reels",
  }
);
const restId = await seed(
  `CC Bistro ${stamp}`,
  `cc-bistro-${stamp}`,
  "Restaurant",
  {
    decision: "More brunch posts",
    why: "Restaurant evidence",
    action: "Increase brunch",
  }
);

const failures = [];

const { data: salonSettings } = await client
  .from("automation_settings")
  .select("latest_decision, next_planned_action")
  .eq("organisation_id", salonId)
  .single();
const { data: restSettings } = await client
  .from("automation_settings")
  .select("latest_decision, next_planned_action")
  .eq("organisation_id", restId)
  .single();

if (JSON.stringify(salonSettings?.latest_decision).includes("brunch")) {
  failures.push("restaurant decision leaked to salon");
}
if (JSON.stringify(restSettings?.latest_decision).includes("braiding")) {
  failures.push("salon decision leaked to restaurant");
}

const { data: salonAct } = await client
  .from("automation_activity")
  .select("message")
  .eq("organisation_id", salonId);
const { data: restAct } = await client
  .from("automation_activity")
  .select("message")
  .eq("organisation_id", restId);

if ((salonAct ?? []).some((a) => a.message.includes("Bistro"))) {
  failures.push("bistro activity on salon");
}
if ((restAct ?? []).some((a) => a.message.includes("Salon"))) {
  failures.push("salon activity on bistro");
}

const { count: crossContent } = await client
  .from("content")
  .select("*", { count: "exact", head: true })
  .eq("organisation_id", salonId)
  .ilike("title", "%Bistro%");

if ((crossContent ?? 0) > 0) failures.push("cross content title match");

await admin.from("organisations").delete().eq("id", salonId);
await admin.from("organisations").delete().eq("id", restId);
await admin.auth.admin.deleteUser(user.id);

const ok = failures.length === 0;
console.log(JSON.stringify({ ok, failures }, null, 2));
if (!ok) process.exit(1);
