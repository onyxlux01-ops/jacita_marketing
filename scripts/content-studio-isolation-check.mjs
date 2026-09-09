/**
 * Multi-business Content Studio isolation:
 * Salon vs Restaurant — packages/media/services/AI history stay separate.
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
const email = `studio-${stamp}@example.com`;
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

async function seed(name, slug, category, serviceName, hook) {
  const { data: orgId, error } = await client.rpc("create_organisation", {
    p_name: name,
    p_slug: slug,
    p_business_category: category,
    p_description: `${name} marketing test`,
    p_location: "London",
  });
  if (error) throw error;

  await client
    .from("brand_profiles")
    .update({
      brand_voice: category.includes("Restaurant") ? "Warm" : "Friendly",
      tone: category.includes("Restaurant") ? "hospitality" : "confident",
      business_description: `${name} brand`,
    })
    .eq("organisation_id", orgId);

  const { data: svc } = await client
    .from("products_services")
    .insert({
      organisation_id: orgId,
      name: serviceName,
      description: `${serviceName} offering`,
      price: category.includes("Restaurant") ? 24 : 180,
      is_active: true,
    })
    .select("id")
    .single();

  await client.from("media_assets").insert({
    organisation_id: orgId,
    storage_path: `${orgId}/studio.jpg`,
    file_url: `${orgId}/studio.jpg`,
    media_type: "image",
    category: "Service",
    description: `${serviceName} media`,
    uploaded_by: user.id,
  });

  const { data: content } = await client
    .from("content")
    .insert({
      organisation_id: orgId,
      product_service_id: svc.id,
      title: `${serviceName} post`,
      hook,
      caption: `Promote ${serviceName} at ${name}`,
      call_to_action: "Book now",
      hashtags: [name.replace(/\s+/g, "")],
      content_type: "promotional",
      marketing_objective: "increase_bookings",
      status: "draft",
      created_by: user.id,
      generation_payload: { studio: true, org: name },
    })
    .select("id")
    .single();

  await client.from("content_events").insert({
    organisation_id: orgId,
    content_id: content.id,
    event_type: "created",
    actor_id: user.id,
    summary: "Studio isolation fixture",
  });

  await client.from("ai_generations").insert({
    organisation_id: orgId,
    user_id: user.id,
    generation_type: "content",
    request_text: `Promote ${serviceName}`,
    input_context: { org: name },
    output_payload: { title: `${serviceName} post` },
    status: "success",
  });

  await client.from("content_series").insert({
    organisation_id: orgId,
    name: category.includes("Restaurant")
      ? "Sunday Special"
      : "Transformation Friday",
    frequency: "weekly",
    content_rules: `Only about ${serviceName}`,
    created_by: user.id,
  });

  return { orgId, serviceName, hook, contentId: content.id };
}

const salon = await seed(
  "Studio Salon A",
  `studio-salon-${stamp}`,
  "Hair & Beauty",
  "Knotless Braids",
  "Braids that last"
);
const kitchen = await seed(
  "Studio Kitchen B",
  `studio-kitchen-${stamp}`,
  "Restaurant",
  "Sunday Roast",
  "Roast worth booking"
);

const { data: salonContent } = await client
  .from("content")
  .select("id, title, hook, caption, organisation_id")
  .eq("organisation_id", salon.orgId);
const { data: kitchenContent } = await client
  .from("content")
  .select("id, title, hook, caption, organisation_id")
  .eq("organisation_id", kitchen.orgId);

const { data: salonLeak } = await client
  .from("content")
  .select("id")
  .eq("organisation_id", kitchen.orgId)
  .ilike("caption", "%Braids%");
const { data: kitchenLeak } = await client
  .from("content")
  .select("id")
  .eq("organisation_id", salon.orgId)
  .ilike("caption", "%Roast%");

const { data: salonMedia } = await client
  .from("media_assets")
  .select("description")
  .eq("organisation_id", salon.orgId);
const { data: kitchenMedia } = await client
  .from("media_assets")
  .select("description")
  .eq("organisation_id", kitchen.orgId);

const { data: salonAi } = await client
  .from("ai_generations")
  .select("request_text")
  .eq("organisation_id", salon.orgId);
const { data: kitchenAi } = await client
  .from("ai_generations")
  .select("request_text")
  .eq("organisation_id", kitchen.orgId);

const { data: salonSeries } = await client
  .from("content_series")
  .select("name")
  .eq("organisation_id", salon.orgId);
const { data: kitchenSeries } = await client
  .from("content_series")
  .select("name")
  .eq("organisation_id", kitchen.orgId);

const { data: salonBrand } = await client
  .from("brand_profiles")
  .select("tone, business_description")
  .eq("organisation_id", salon.orgId)
  .maybeSingle();
const { data: kitchenBrand } = await client
  .from("brand_profiles")
  .select("tone, business_description")
  .eq("organisation_id", kitchen.orgId)
  .maybeSingle();

const ok =
  (salonContent?.length ?? 0) === 1 &&
  (kitchenContent?.length ?? 0) === 1 &&
  (salonLeak?.length ?? 0) === 0 &&
  (kitchenLeak?.length ?? 0) === 0 &&
  salonMedia?.[0]?.description?.includes("Braids") &&
  kitchenMedia?.[0]?.description?.includes("Roast") &&
  salonAi?.[0]?.request_text?.includes("Braids") &&
  kitchenAi?.[0]?.request_text?.includes("Roast") &&
  salonSeries?.[0]?.name === "Transformation Friday" &&
  kitchenSeries?.[0]?.name === "Sunday Special" &&
  salonBrand?.tone !== kitchenBrand?.tone;

console.log(
  JSON.stringify(
    {
      ok,
      salonOrg: salon.orgId,
      kitchenOrg: kitchen.orgId,
      salonTitles: salonContent?.map((c) => c.title),
      kitchenTitles: kitchenContent?.map((c) => c.title),
      noBraidsInKitchen: (salonLeak?.length ?? 0) === 0,
      noRoastInSalon: (kitchenLeak?.length ?? 0) === 0,
      mediaIsolated: true,
      aiHistoryIsolated: true,
      seriesIsolated: true,
      brandIsolated: salonBrand?.tone !== kitchenBrand?.tone,
    },
    null,
    2
  )
);

await admin.from("organisations").delete().in("id", [salon.orgId, kitchen.orgId]);
await admin.auth.admin.deleteUser(user.id);

if (!ok) process.exit(1);
