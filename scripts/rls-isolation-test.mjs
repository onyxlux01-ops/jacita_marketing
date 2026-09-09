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
const emailA = `rls-a-${stamp}@example.com`;
const emailB = `rls-b-${stamp}@example.com`;
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

const userA = await makeUser(emailA);
const userB = await makeUser(emailB);
const clientA = await asUser(emailA);
const clientB = await asUser(emailB);

const { data: orgA, error: eA } = await clientA.rpc("create_organisation", {
  p_name: "Business Alpha Test",
  p_slug: `alpha-${stamp}`,
  p_business_category: "Cafe",
  p_description: "Alpha only",
  p_location: "London",
});
if (eA) throw eA;

const { data: orgB, error: eB } = await clientB.rpc("create_organisation", {
  p_name: "Business Beta Test",
  p_slug: `beta-${stamp}`,
  p_business_category: "Salon",
  p_description: "Beta only",
  p_location: "Manchester",
});
if (eB) throw eB;

const { data: svcA, error: sA } = await clientA
  .from("products_services")
  .insert({
    organisation_id: orgA,
    name: "Alpha Latte",
    description: "secret A",
    price: 4.5,
  })
  .select("id,name")
  .single();
if (sA) throw sA;

const { data: svcB, error: sB } = await clientB
  .from("products_services")
  .insert({
    organisation_id: orgB,
    name: "Beta Cut",
    description: "secret B",
    price: 30,
  })
  .select("id,name")
  .single();
if (sB) throw sB;

const { data: aSeesB } = await clientA
  .from("products_services")
  .select("id,name")
  .eq("organisation_id", orgB);
const { data: bSeesA } = await clientB
  .from("products_services")
  .select("id,name")
  .eq("organisation_id", orgA);

const { error: aIntoB } = await clientA.from("products_services").insert({
  organisation_id: orgB,
  name: "Intrusion",
});

await clientA
  .from("products_services")
  .update({ name: "Hacked" })
  .eq("id", svcB.id);

await clientA.from("products_services").delete().eq("id", svcB.id);

const { data: stillB } = await admin
  .from("products_services")
  .select("name")
  .eq("id", svcB.id)
  .single();

const { data: aOwn } = await clientA
  .from("products_services")
  .select("name")
  .eq("organisation_id", orgA);
const { data: bOwn } = await clientB
  .from("products_services")
  .select("name")
  .eq("organisation_id", orgB);

const { data: aOrgs } = await clientA.from("organisations").select("id,name");
const { data: bOrgs } = await clientB.from("organisations").select("id,name");

const { data: aMetrics } = await clientA
  .from("analytics_metrics")
  .select("id")
  .eq("organisation_id", orgA);
const { data: aSeesBMetrics } = await clientA
  .from("analytics_metrics")
  .select("id")
  .eq("organisation_id", orgB);

console.log(
  JSON.stringify(
    {
      ok:
        (aSeesB?.length ?? 0) === 0 &&
        (bSeesA?.length ?? 0) === 0 &&
        Boolean(aIntoB) &&
        stillB?.name === "Beta Cut" &&
        (aOrgs?.length ?? 0) === 1 &&
        (bOrgs?.length ?? 0) === 1 &&
        (aSeesBMetrics?.length ?? 0) === 0,
      orgA,
      orgB,
      aOwn: aOwn?.map((x) => x.name),
      bOwn: bOwn?.map((x) => x.name),
      aOrgNames: aOrgs?.map((x) => x.name),
      bOrgNames: bOrgs?.map((x) => x.name),
      aSeesBServices: aSeesB?.length ?? 0,
      bSeesAServices: bSeesA?.length ?? 0,
      crossInsertBlocked: Boolean(aIntoB),
      crossInsertError: aIntoB?.message ?? null,
      betaNameUnchanged: stillB?.name,
      aMetrics: aMetrics?.length ?? 0,
      aSeesBMetrics: aSeesBMetrics?.length ?? 0,
    },
    null,
    2
  )
);

await admin.from("organisations").delete().in("id", [orgA, orgB]);
await admin.auth.admin.deleteUser(userA.id);
await admin.auth.admin.deleteUser(userB.id);
