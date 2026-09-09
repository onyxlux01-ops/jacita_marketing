/**
 * Multi-business isolation for one owner with two organisations:
 * All Hair & Beauty + Harbor Kitchen
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
const email = `onboard-${stamp}@example.com`;
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

async function seedOrg(name, slug, category, extras) {
  const { data: orgId, error } = await client.rpc("create_organisation", {
    p_name: name,
    p_slug: slug,
    p_business_category: category,
    p_description: extras.description,
    p_location: extras.location,
  });
  if (error) throw error;

  await client
    .from("organisations")
    .update({
      country: extras.country,
      onboarding_step: "complete",
      onboarding_completed_at: new Date().toISOString(),
      primary_marketing_goal_key: extras.goal,
    })
    .eq("id", orgId);

  await client
    .from("brand_profiles")
    .update({
      brand_voice: extras.voice,
      tone: extras.tone,
      business_description: extras.brandDescription,
      custom_instructions: extras.custom,
      primary_color: extras.color,
    })
    .eq("organisation_id", orgId);

  await client.from("audience_profiles").upsert({
    organisation_id: orgId,
    ideal_customer_description: extras.audience,
    age_range: extras.age,
    location_focus: extras.location,
  });

  await client.from("products_services").insert(
    extras.services.map((s) => ({
      organisation_id: orgId,
      name: s.name,
      description: s.description,
      price: s.price,
      category: s.category,
      is_active: true,
    }))
  );

  await client.from("media_assets").insert({
    organisation_id: orgId,
    storage_path: `${orgId}/fixture.jpg`,
    file_url: `${orgId}/fixture.jpg`,
    media_type: "image",
    category: extras.mediaCategory,
    description: extras.mediaDesc,
    uploaded_by: user.id,
  });

  await client.from("content").insert({
    organisation_id: orgId,
    title: extras.contentTitle,
    caption: extras.contentCaption,
    status: "draft",
    created_by: user.id,
  });

  return orgId;
}

const orgA = await seedOrg(
  "All Hair & Beauty",
  `all-hair-${stamp}`,
  "Hair & Beauty",
  {
    description: "Salon specialising in braids and treatments",
    location: "Brixton",
    country: "United Kingdom",
    goal: "increase_bookings",
    voice: "Warm",
    tone: "Friendly",
    brandDescription: "Premium braiding salon",
    custom: "Feel premium, friendly and confident.",
    color: "#7B2D8E",
    audience: "Women booking knotless braids in South London",
    age: "22-40",
    services: [
      {
        name: "Knotless Braids",
        description: "Protective style",
        price: 180,
        category: "Braids",
      },
      {
        name: "Hair Extensions",
        description: "Length and volume",
        price: 220,
        category: "Extensions",
      },
    ],
    mediaCategory: "Service",
    mediaDesc: "Knotless braid showcase",
    contentTitle: "Braids booking post",
    contentCaption: "Book knotless braids this week",
  }
);

const orgB = await seedOrg(
  "Harbor Kitchen",
  `harbor-${stamp}`,
  "Restaurant",
  {
    description: "Seasonal British kitchen by the water",
    location: "Harbor Quay",
    country: "United Kingdom",
    goal: "increase_enquiries",
    voice: "Professional",
    tone: "Warm",
    brandDescription: "Sunday roast and private dining",
    custom: "Invite guests to gather around the table.",
    color: "#2F4A3C",
    audience: "Families and couples booking Sunday roast",
    age: "28-55",
    services: [
      {
        name: "Sunday Roast",
        description: "Seasonal sides",
        price: 24,
        category: "Dining",
      },
      {
        name: "Private Dining",
        description: "Groups up to 16",
        price: 45,
        category: "Events",
      },
    ],
    mediaCategory: "Brand",
    mediaDesc: "Harbor dining room",
    contentTitle: "Roast reservation post",
    contentCaption: "Reserve Sunday roast",
  }
);

async function snapshot(orgId) {
  const [
    { data: brand },
    { data: audience },
    { data: services },
    { data: media },
    { data: content },
    { data: goals },
    { data: social },
    { data: analytics },
  ] = await Promise.all([
    client
      .from("brand_profiles")
      .select("brand_voice, custom_instructions, primary_color")
      .eq("organisation_id", orgId)
      .maybeSingle(),
    client
      .from("audience_profiles")
      .select("ideal_customer_description")
      .eq("organisation_id", orgId)
      .maybeSingle(),
    client
      .from("products_services")
      .select("name")
      .eq("organisation_id", orgId),
    client
      .from("media_assets")
      .select("description, category")
      .eq("organisation_id", orgId),
    client.from("content").select("title").eq("organisation_id", orgId),
    client
      .from("organisations")
      .select("primary_marketing_goal_key, name")
      .eq("id", orgId)
      .maybeSingle(),
    client
      .from("social_accounts")
      .select("platform, connection_status")
      .eq("organisation_id", orgId),
    client
      .from("analytics_metrics")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId),
  ]);
  return {
    brand,
    audience,
    services: (services ?? []).map((s) => s.name).sort(),
    media,
    content: (content ?? []).map((c) => c.title),
    goal: goals?.primary_marketing_goal_key,
    name: goals?.name,
    socialCount: social?.length ?? 0,
    analyticsPresent: (analytics ?? null) !== null,
  };
}

const snapA = await snapshot(orgA);
const snapB = await snapshot(orgB);

// Cross-org reads should return empty when filtering by the other id
// (same user can access both, but data must not leak across filters)
const { data: aServicesInB } = await client
  .from("products_services")
  .select("name")
  .eq("organisation_id", orgB)
  .ilike("name", "%Braids%");
const { data: bServicesInA } = await client
  .from("products_services")
  .select("name")
  .eq("organisation_id", orgA)
  .ilike("name", "%Roast%");

const { data: memberships } = await client
  .from("organisation_members")
  .select("organisation_id, role")
  .eq("user_id", user.id);

const brandCross =
  snapA.brand?.custom_instructions === snapB.brand?.custom_instructions ||
  snapA.brand?.primary_color === snapB.brand?.primary_color;
const audienceCross =
  snapA.audience?.ideal_customer_description ===
  snapB.audience?.ideal_customer_description;
const servicesCross = snapA.services.some((n) => snapB.services.includes(n));
const contentCross = snapA.content.some((t) => snapB.content.includes(t));
const mediaCross = (snapA.media ?? []).some((m) =>
  (snapB.media ?? []).some((x) => x.description === m.description)
);
const goalsCross = snapA.goal === snapB.goal;

const ok =
  memberships?.length === 2 &&
  snapA.name === "All Hair & Beauty" &&
  snapB.name === "Harbor Kitchen" &&
  !brandCross &&
  !audienceCross &&
  !servicesCross &&
  !contentCross &&
  !mediaCross &&
  !goalsCross &&
  (aServicesInB?.length ?? 0) === 0 &&
  (bServicesInA?.length ?? 0) === 0 &&
  snapA.socialCount === 3 &&
  snapB.socialCount === 3;

console.log(
  JSON.stringify(
    {
      ok,
      orgA,
      orgB,
      snapA,
      snapB,
      membershipCount: memberships?.length ?? 0,
      brandIsolated: !brandCross,
      audienceIsolated: !audienceCross,
      servicesIsolated: !servicesCross,
      contentIsolated: !contentCross,
      mediaIsolated: !mediaCross,
      goalsIsolated: !goalsCross,
      noBraidsInHarbor: (aServicesInB?.length ?? 0) === 0,
      noRoastInSalon: (bServicesInA?.length ?? 0) === 0,
    },
    null,
    2
  )
);

await admin.from("organisations").delete().in("id", [orgA, orgB]);
await admin.auth.admin.deleteUser(user.id);

if (!ok) process.exit(1);
