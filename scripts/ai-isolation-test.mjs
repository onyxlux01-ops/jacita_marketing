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
const password = "TestPass123!";

async function makeUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function asUser(email) {
  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function loadContext(client, organisationId) {
  const [{ data: organisation }, { data: services }, { data: media }] =
    await Promise.all([
      client
        .from("organisations")
        .select("id, name, business_category, description")
        .eq("id", organisationId)
        .maybeSingle(),
      client
        .from("products_services")
        .select("id, name")
        .eq("organisation_id", organisationId),
      client
        .from("media_assets")
        .select("id")
        .eq("organisation_id", organisationId),
    ]);
  return { organisation, services: services ?? [], media: media ?? [] };
}

const emailA = `ai-a-${stamp}@example.com`;
const emailB = `ai-b-${stamp}@example.com`;
const userA = await makeUser(emailA);
const userB = await makeUser(emailB);
const clientA = await asUser(emailA);
const clientB = await asUser(emailB);

const { data: orgA, error: eA } = await clientA.rpc("create_organisation", {
  p_name: "Northside Braids Salon",
  p_slug: `salon-${stamp}`,
  p_business_category: "Hair salon",
  p_description: "Specialist knotless braids and protective styles",
  p_location: "London",
});
if (eA) throw eA;

const { data: orgB, error: eB } = await clientB.rpc("create_organisation", {
  p_name: "Harbour Kitchen",
  p_slug: `resto-${stamp}`,
  p_business_category: "Restaurant",
  p_description: "Seasonal seafood and weekend brunch",
  p_location: "Brighton",
});
if (eB) throw eB;

await clientA.from("products_services").insert({
  organisation_id: orgA,
  name: "Knotless braids",
  description: "Lightweight protective braids",
  price: 120,
  is_featured: true,
});
await clientB.from("products_services").insert({
  organisation_id: orgB,
  name: "Weekend brunch set",
  description: "Bottomless brunch for two",
  price: 45,
  is_featured: true,
});

const ctxA = await loadContext(clientA, orgA);
const ctxB = await loadContext(clientB, orgB);

const { data: aSeesB } = await clientA
  .from("products_services")
  .select("name")
  .eq("organisation_id", orgB);
const { data: bSeesA } = await clientB
  .from("products_services")
  .select("name")
  .eq("organisation_id", orgA);

const { error: aIntoB } = await clientA.from("ai_generations").insert({
  organisation_id: orgB,
  user_id: userA.id,
  generation_type: "assistant",
  request_text: "intrusion",
  status: "success",
});

const { data: genA, error: genOk } = await clientA
  .from("ai_generations")
  .insert({
    organisation_id: orgA,
    user_id: userA.id,
    generation_type: "content",
    request_text: "Promote knotless braids",
    input_context: { org: ctxA.organisation?.name },
    output_payload: { caption: `Book knotless braids at ${ctxA.organisation?.name}` },
    status: "fallback",
    model: "demo",
  })
  .select("id")
  .single();

const { data: aSeesBGens } = await clientA
  .from("ai_generations")
  .select("id")
  .eq("organisation_id", orgB);

const salonServiceNames = ctxA.services.map((s) => s.name).join(" ");
const restoServiceNames = ctxB.services.map((s) => s.name).join(" ");

console.log(
  JSON.stringify(
    {
      ok:
        ctxA.organisation?.name === "Northside Braids Salon" &&
        ctxB.organisation?.name === "Harbour Kitchen" &&
        salonServiceNames.includes("Knotless") &&
        restoServiceNames.includes("brunch") &&
        !salonServiceNames.toLowerCase().includes("brunch") &&
        !restoServiceNames.toLowerCase().includes("braid") &&
        (aSeesB?.length ?? 0) === 0 &&
        (bSeesA?.length ?? 0) === 0 &&
        Boolean(aIntoB) &&
        !genOk &&
        Boolean(genA?.id) &&
        (aSeesBGens?.length ?? 0) === 0 &&
        ctxA.media.length === 0,
      missingMediaForSalon: ctxA.media.length === 0,
      crossInsertAiGenBlocked: Boolean(aIntoB),
      crossInsertError: aIntoB?.message ?? null,
      aServices: ctxA.services.map((s) => s.name),
      bServices: ctxB.services.map((s) => s.name),
    },
    null,
    2
  )
);

await admin.from("organisations").delete().in("id", [orgA, orgB]);
await admin.auth.admin.deleteUser(userA.id);
await admin.auth.admin.deleteUser(userB.id);
