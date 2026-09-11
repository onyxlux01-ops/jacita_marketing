/**
 * Fill All Hair & Beauty + create Precise Cleaning from their websites.
 * Usage: node --env-file=.env.local scripts/seed-business-profiles.mjs
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ALL_HAIR_ID = "f0946484-e165-4348-8f81-fa229f992d6b";
const OWNER_ID = "8c6e5379-d193-4a5e-8bb5-d34ee794b015";

const allHair = {
  org: {
    name: "All Hair & Beauty",
    slug: "all-hair-beauty",
    business_category: "Hair & Beauty Salon",
    description:
      "Texture specialists in Nottingham. Braids, locs and natural hair across two salons — Peveril Street (Radford) and Alfreton Road (Hyson Green).",
    location: "Nottingham, United Kingdom",
    country: "United Kingdom",
    website: "https://allhairandbeautysalon.com",
    booking_url: "https://allhairandbeautysalon.com/services",
    phone: "+447855054241",
    email: "info@allhairandbeautysalon.com",
    primary_marketing_goal_key: "increase_bookings",
    onboarding_step: "complete",
    onboarding_completed_at: new Date().toISOString(),
    timezone: "Europe/London",
  },
  brand: {
    brand_voice:
      "Texture-first and craft-led. Confident, warm, and rooted in Nottingham. Speaks to crowns we know best — braids, locs and natural hair — without fluff.",
    tone: "Warm, specialist, confident",
    target_audience:
      "People in Nottingham seeking expert braids, locs, cornrows, weaves and natural hair care — especially clients who want texture considered at every step.",
    business_description:
      "All Hair & Beauty is a Nottingham texture specialist with chairs at 26 Peveril Street, Radford (NG7 4AL) and 116–118 Alfreton Road, Hyson Green (NG7 3NS). Services span braids, locs, cornrows, weaves, colour, kids’ styles and in-house hair care (Salon JA62), plus texture training for stylists.",
    preferred_terminology:
      "texture, braids, locs, knotless, cornrows, natural hair, consultation, Nottingham",
    words_to_avoid:
      "cheap, bargain, generic salon, one-size-fits-all, chemical-heavy language",
    primary_color: "#1A1A1A",
    secondary_color: "#C4A574",
    custom_instructions:
      "Always mention Nottingham and texture expertise. Prefer booking CTAs to the services page. Two locations: Peveril Street (07855 054241) and Alfreton Road (07577 118434). Brand line: Texture. Craft. Nottingham.",
    marketing_objectives: "increase_bookings, promote_service, increase_brand_awareness",
  },
  audience: {
    age_range: "18–45",
    location_focus: "Nottingham, Radford, Hyson Green, NG7 and surrounding areas",
    interests: [
      "braids",
      "locs",
      "natural hair",
      "protective styles",
      "beauty",
      "self-care",
    ],
    customer_types: [
      "local residents",
      "students",
      "professionals",
      "parents booking kids’ styles",
    ],
    income_lifestyle: "Value quality craft and consultation; willing to book specialist texture work",
    ideal_customer_description:
      "Nottingham clients who want expert braids, locs or natural hair styling from a texture-first salon — not a generic cut-and-blowdry.",
    additional_notes:
      "Two doors: Radford (Peveril Street) and Hyson Green (Alfreton Road). Email info@allhairandbeautysalon.com.",
  },
  goals: [
    "increase_bookings",
    "promote_service",
    "increase_brand_awareness",
    "increase_repeat_customers",
  ],
  services: [
    {
      name: "Knotless Braids",
      category: "Braids",
      description: "Knotless braids from £95+. Final quote confirmed in consultation.",
      price: 95,
      is_featured: true,
      is_active: true,
    },
    {
      name: "Normal Braids",
      category: "Braids",
      description: "Classic braids from £90+. Consultation confirms final price.",
      price: 90,
      is_featured: true,
      is_active: true,
    },
    {
      name: "Goddess Braids",
      category: "Braids",
      description: "Goddess braids from £95+.",
      price: 95,
      is_featured: true,
      is_active: true,
    },
    {
      name: "Locs Retwist",
      category: "Locs",
      description: "Loc maintenance retwist from £55+.",
      price: 55,
      is_featured: true,
      is_active: true,
    },
    {
      name: "Locs Interlocking",
      category: "Locs",
      description: "Interlocking from £70+.",
      price: 70,
      is_featured: false,
      is_active: true,
    },
    {
      name: "Cornrows Style with Extension",
      category: "Cornrows",
      description: "Cornrows with extension from £45+.",
      price: 45,
      is_featured: false,
      is_active: true,
    },
    {
      name: "Wash & Blowdry",
      category: "Wash & Finish",
      description: "Wash and blowdry from £30.",
      price: 30,
      is_featured: false,
      is_active: true,
    },
    {
      name: "Natural Hair Twist",
      category: "Natural Hair",
      description: "Natural hair twist from £40+.",
      price: 40,
      is_featured: false,
      is_active: true,
    },
  ],
};

const precise = {
  org: {
    name: "Precise Cleaning Limited",
    slug: "precise-cleaning",
    business_category: "Domestic & Commercial Cleaning",
    description:
      "Professional domestic and commercial cleaning across Nottingham and Nottinghamshire. Fully insured, DBS-checked, eco-friendly products, satisfaction guaranteed.",
    location: "Radford, Nottingham, United Kingdom",
    country: "United Kingdom",
    website: "https://precisecleaningltd.com",
    booking_url: "https://precisecleaningltd.com",
    phone: "+447832408348",
    email: "info@precisecleaningltd.com",
    primary_marketing_goal_key: "increase_enquiries",
    onboarding_step: "complete",
    onboarding_completed_at: new Date().toISOString(),
    timezone: "Europe/London",
    created_by: OWNER_ID,
  },
  brand: {
    brand_voice:
      "Reliable, detail-obsessed and straightforward. Professional without being cold — local Nottingham cleaners who make spaces feel brand new.",
    tone: "Professional, trustworthy, friendly",
    target_audience:
      "Homeowners, landlords, tenants, offices and commercial properties across Nottingham and Nottinghamshire who want insured, DBS-checked cleaning with a clear quote.",
    business_description:
      "Precise Cleaning Limited is based at 26 Peveril Street, Radford, Nottingham NG7 4AL. Services include domestic, commercial, end of tenancy, and carpet & upholstery cleaning. £5m public liability insurance, DBS-checked uniformed teams, eco-friendly products, free quote within 24 hours, and a 72-hour satisfaction guarantee. Rated 4.7 on Google.",
    preferred_terminology:
      "fully insured, DBS-checked, end of tenancy, domestic cleaning, commercial cleaning, free quote, Nottingham, eco-friendly",
    words_to_avoid: "cheap, cowboy, uninsured, bargain basement, dirty jobs slang",
    primary_color: "#0B5FFF",
    secondary_color: "#0F172A",
    custom_instructions:
      "Lead with trust signals: insured, DBS-checked, eco-friendly, satisfaction guarantee. CTA should drive quote requests (quote in under 24 hours). Phone 07832 408348. Address 26 Peveril Street, Radford, NG7 4AL. Mention 4.7 Google rating when social proof helps.",
    marketing_objectives:
      "increase_enquiries, increase_website_traffic, increase_brand_awareness, promote_service",
  },
  audience: {
    age_range: "25–55",
    location_focus:
      "Nottingham city, Radford, NG7, and surrounding Nottinghamshire villages",
    interests: [
      "home maintenance",
      "property management",
      "office facilities",
      "moving house",
      "local services",
    ],
    customer_types: [
      "homeowners",
      "landlords",
      "tenants",
      "letting agents",
      "offices",
      "student accommodation managers",
    ],
    income_lifestyle:
      "Busy households and property professionals who value reliability, insurance cover and clear pricing over the cheapest quote",
    ideal_customer_description:
      "Nottingham homes and businesses that need a trusted, insured cleaner — regular domestic, commercial, or end-of-tenancy — with a fixed quote in under 24 hours.",
    additional_notes:
      "Strong end-of-tenancy reputation with letting agents. Instant price estimate on site; final quote confirmed within 24 hours.",
  },
  goals: [
    "increase_enquiries",
    "increase_website_traffic",
    "promote_service",
    "increase_brand_awareness",
  ],
  services: [
    {
      name: "Domestic Cleaning",
      category: "Domestic",
      description:
        "Regular and one-off home cleaning tailored to your routine. Indicative fortnightly cleans often from around £70–£90 depending on size.",
      price: 70,
      is_featured: true,
      is_active: true,
    },
    {
      name: "Commercial Cleaning",
      category: "Commercial",
      description:
        "Professional cleaning for offices, workplaces and busy businesses across Nottingham.",
      price: null,
      is_featured: true,
      is_active: true,
    },
    {
      name: "End of Tenancy Cleaning",
      category: "End of Tenancy",
      description:
        "Comprehensive move-in and move-out cleans designed to help win deposits back. Popular with landlords and letting agents.",
      price: null,
      is_featured: true,
      is_active: true,
    },
    {
      name: "Carpet & Upholstery Cleaning",
      category: "Specialist",
      description:
        "Professional stain removal and fabric care for carpets and sofas.",
      price: null,
      is_featured: false,
      is_active: true,
    },
  ],
};

async function upsertGoals(orgId, keys, primary) {
  await sb
    .from("marketing_goals")
    .update({ status: "archived" })
    .eq("organisation_id", orgId)
    .eq("status", "active");

  for (const key of keys) {
    const { data: existing } = await sb
      .from("marketing_goals")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("goal_key", key)
      .maybeSingle();

    const title = key.replaceAll("_", " ");
    if (existing) {
      const { error } = await sb
        .from("marketing_goals")
        .update({ status: "active", title })
        .eq("id", existing.id);
      if (error) throw new Error(`goal update ${key}: ${error.message}`);
    } else {
      const { error } = await sb.from("marketing_goals").insert({
        organisation_id: orgId,
        goal_key: key,
        title,
        status: "active",
      });
      if (error) throw new Error(`goal insert ${key}: ${error.message}`);
    }
  }

  await sb
    .from("organisations")
    .update({ primary_marketing_goal_key: primary })
    .eq("id", orgId);
}

async function replaceServices(orgId, services) {
  const { error: delErr } = await sb
    .from("products_services")
    .delete()
    .eq("organisation_id", orgId);
  if (delErr) throw new Error(`delete services: ${delErr.message}`);

  const rows = services.map((s) => ({
    organisation_id: orgId,
    name: s.name,
    category: s.category,
    description: s.description,
    price: s.price,
    is_featured: s.is_featured,
    is_active: s.is_active,
    is_promotion: false,
  }));
  const { error } = await sb.from("products_services").insert(rows);
  if (error) throw new Error(`insert services: ${error.message}`);
}

async function fillProfile(orgId, profile, { createOrg = false } = {}) {
  if (createOrg) {
    const { data, error } = await sb
      .from("organisations")
      .insert(profile.org)
      .select("id")
      .single();
    if (error) throw new Error(`create org: ${error.message}`);
    orgId = data.id;

    const { error: memErr } = await sb.from("organisation_members").insert({
      organisation_id: orgId,
      user_id: OWNER_ID,
      role: "owner",
    });
    if (memErr) throw new Error(`member: ${memErr.message}`);

    const { error: brandIns } = await sb
      .from("brand_profiles")
      .insert({ organisation_id: orgId, ...profile.brand });
    if (brandIns) throw new Error(`brand insert: ${brandIns.message}`);

    const { error: audIns } = await sb
      .from("audience_profiles")
      .insert({ organisation_id: orgId, ...profile.audience });
    if (audIns) throw new Error(`audience insert: ${audIns.message}`);
  } else {
    const { error: orgErr } = await sb
      .from("organisations")
      .update(profile.org)
      .eq("id", orgId);
    if (orgErr) throw new Error(`org update: ${orgErr.message}`);

    const { error: brandErr } = await sb
      .from("brand_profiles")
      .update(profile.brand)
      .eq("organisation_id", orgId);
    if (brandErr) throw new Error(`brand update: ${brandErr.message}`);

    const { error: audErr } = await sb
      .from("audience_profiles")
      .update(profile.audience)
      .eq("organisation_id", orgId);
    if (audErr) throw new Error(`audience update: ${audErr.message}`);
  }

  await upsertGoals(
    orgId,
    profile.goals,
    profile.org.primary_marketing_goal_key
  );
  await replaceServices(orgId, profile.services);
  return orgId;
}

const result = {
  allHair: await fillProfile(ALL_HAIR_ID, allHair),
  precise: await fillProfile(null, precise, { createOrg: true }),
};

const { data: orgs } = await sb
  .from("organisations")
  .select("id,name,slug,website,email,phone,location,business_category,onboarding_step")
  .order("created_at");

const counts = {};
for (const o of orgs || []) {
  const { count } = await sb
    .from("products_services")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", o.id);
  counts[o.slug] = count;
}

console.log(JSON.stringify({ result, orgs, serviceCounts: counts }, null, 2));
