/**
 * Complete all profile fields for All Hair & Beauty and Precise Cleaning.
 * Usage: node --env-file=.env.local scripts/complete-business-profiles.mjs
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ALL_HAIR = "f0946484-e165-4348-8f81-fa229f992d6b";
const PRECISE = "2febc75d-4aba-44f0-839d-5ebb149e5613";
const OWNER = "8c6e5379-d193-4a5e-8bb5-d34ee794b015";

function parsePrice(raw) {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

async function uploadLogoFromUrl(orgId, imageUrl, filename) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`logo fetch ${imageUrl}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/webp";
  const path = `${orgId}/${filename}`;
  const { error } = await sb.storage.from("brand").upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`logo upload: ${error.message}`);
  return path;
}

async function upsertGoals(orgId, goals, primary) {
  await sb
    .from("marketing_goals")
    .update({ status: "archived" })
    .eq("organisation_id", orgId)
    .eq("status", "active");

  for (const g of goals) {
    const { data: existing } = await sb
      .from("marketing_goals")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("goal_key", g.key)
      .maybeSingle();

    const row = {
      status: "active",
      title: g.title,
      description: g.description,
      target_metric: g.target_metric || null,
    };

    if (existing) {
      const { error } = await sb
        .from("marketing_goals")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(`goal ${g.key}: ${error.message}`);
    } else {
      const { error } = await sb.from("marketing_goals").insert({
        organisation_id: orgId,
        goal_key: g.key,
        ...row,
      });
      if (error) throw new Error(`goal insert ${g.key}: ${error.message}`);
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
    price: s.price ?? parsePrice(s.priceLabel),
    duration_minutes: s.duration_minutes ?? null,
    target_audience: s.target_audience ?? null,
    is_featured: Boolean(s.is_featured),
    is_active: s.is_active !== false,
    is_promotion: Boolean(s.is_promotion),
  }));

  const { error } = await sb.from("products_services").insert(rows);
  if (error) throw new Error(`insert services: ${error.message}`);
}

async function upsertAutomation(orgId, patch) {
  const { data: existing } = await sb
    .from("automation_settings")
    .select("organisation_id")
    .eq("organisation_id", orgId)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("automation_settings")
      .update(patch)
      .eq("organisation_id", orgId);
    if (error) throw new Error(`automation update: ${error.message}`);
  } else {
    const { error } = await sb.from("automation_settings").insert({
      organisation_id: orgId,
      ...patch,
    });
    if (error) throw new Error(`automation insert: ${error.message}`);
  }
}

const allHairHours = {
  text: "Both salons: Mon–Fri 09:00–19:00 · Sat 08:30–18:00 · Sun Closed",
  locations: {
    peveril: {
      name: "Peveril Street (Radford)",
      address: "26 Peveril Street, Radford, Nottingham NG7 4AL",
      phone: "+447855054241",
      hours: {
        mon_fri: "09:00–19:00",
        sat: "08:30–18:00",
        sun: "Closed",
      },
    },
    alfreton: {
      name: "Alfreton Road (Hyson Green)",
      address: "116–118 Alfreton Road, Nottingham NG7 3NS",
      phone: "+447577118434",
      hours: {
        mon_fri: "09:00–19:00",
        sat: "08:30–18:00",
        sun: "Closed",
      },
    },
  },
};

const preciseHours = {
  text: "Quotes and bookings online 24/7 · Office / ops based in Radford, Nottingham · Call 07832 408348 for same-day enquiries",
  note: "Service hours arranged per booking across Nottingham & Nottinghamshire",
};

const allHairServices = [
  {
    name: "Normal Braids",
    category: "Braids",
    price: 90,
    priceLabel: "£90+",
    duration_minutes: 300,
    is_featured: true,
    target_audience: "Clients wanting classic protective braids",
    description:
      "Classic braids from £90+. Final quote confirmed in consultation at either Nottingham salon.",
  },
  {
    name: "Knotless Braids",
    category: "Braids",
    price: 95,
    duration_minutes: 360,
    is_featured: true,
    target_audience: "Clients wanting lighter, flexible braids",
    description: "Knotless braids from £95+. Texture considered from consultation to finish.",
  },
  {
    name: "Goddess Braids",
    category: "Braids",
    price: 95,
    duration_minutes: 300,
    is_featured: true,
    target_audience: "Clients wanting statement goddess braids",
    description: "Goddess braids from £95+.",
  },
  {
    name: "Wash & Blowdry",
    category: "Washing",
    price: 30,
    duration_minutes: 60,
    is_featured: false,
    target_audience: "Clients needing a clean finish",
    description: "Wash and blowdry from £30.",
  },
  {
    name: "Wash & Set",
    category: "Washing",
    price: 25,
    duration_minutes: 60,
    is_featured: false,
    description: "Wash and set from £25.",
  },
  {
    name: "Blowdry",
    category: "Washing",
    price: 10,
    duration_minutes: 30,
    is_featured: false,
    description: "Blowdry from £10.",
  },
  {
    name: "Cornrows for Wig",
    category: "Cornrows",
    price: 25,
    duration_minutes: 60,
    is_featured: false,
    description: "Cornrows for wig from £25+.",
  },
  {
    name: "Natural Hairstyle Cornrows",
    category: "Cornrows",
    price: 25,
    duration_minutes: 90,
    is_featured: false,
    description: "Natural hairstyle cornrows from £25+.",
  },
  {
    name: "Cornrows Style with Extension",
    category: "Cornrows",
    price: 45,
    duration_minutes: 120,
    is_featured: true,
    description: "Cornrows with extension from £45+.",
  },
  {
    name: "Stitch Braids with Extension",
    category: "Cornrows",
    price: 45,
    duration_minutes: 150,
    is_featured: false,
    description: "Stitch braids with extension from £45+.",
  },
  {
    name: "Natural Hair Twist",
    category: "Cornrows",
    price: 40,
    duration_minutes: 120,
    is_featured: false,
    description: "Natural hair twist from £40+.",
  },
  {
    name: "Natural Hair Plaits",
    category: "Cornrows",
    price: 40,
    duration_minutes: 120,
    is_featured: false,
    description: "Natural hair plaits from £40+.",
  },
  {
    name: "Standard Weave",
    category: "Weave",
    price: 70,
    duration_minutes: 180,
    is_featured: true,
    target_audience: "Clients wanting a full weave install",
    description: "Standard weave from £70+. Includes cornrows and a basic style of weave.",
  },
  {
    name: "Weave & Style (e.g. 27 pieces)",
    category: "Weave",
    price: 70,
    duration_minutes: 210,
    is_featured: false,
    description: "Weave and style from £70–£85 depending on pieces and finish.",
  },
  {
    name: "Straightening",
    category: "Straightening & Curling",
    price: 60,
    duration_minutes: 90,
    is_featured: false,
    description: "Heat styling / straightening from £60+. Heat handled with restraint.",
  },
  {
    name: "Curling",
    category: "Straightening & Curling",
    price: 60,
    duration_minutes: 90,
    is_featured: false,
    description: "Curling from £60+.",
  },
  {
    name: "Colour",
    category: "Colouring",
    price: 35,
    duration_minutes: 120,
    is_featured: false,
    target_audience: "Clients wanting considered colour work",
    description: "Colour from £35+. Tone considered before it is applied.",
  },
  {
    name: "Kids Braids",
    category: "Kids",
    price: 60,
    duration_minutes: 150,
    is_featured: false,
    target_audience: "Parents booking children’s protective styles",
    description: "Kids braids from £60+. Gentle chairs for the smallest guests.",
  },
  {
    name: "Kids Cornrows",
    category: "Kids",
    price: 20,
    duration_minutes: 60,
    is_featured: false,
    description: "Kids cornrows / styles from £20+.",
  },
  {
    name: "Crochet",
    category: "Crochet",
    price: 70,
    duration_minutes: 180,
    is_featured: false,
    description: "Crochet styles from £70+. Includes cornrow pattern.",
  },
  {
    name: "Locs Basic Washing",
    category: "Locs",
    price: 15,
    duration_minutes: 45,
    is_featured: false,
    description: "Basic locs washing £15–£20.",
  },
  {
    name: "ACV Rinse & Steam",
    category: "Locs",
    price: 35,
    duration_minutes: 60,
    is_featured: false,
    description: "ACV rinse and steam from £35+.",
  },
  {
    name: "Locs Detox",
    category: "Locs",
    price: 35,
    duration_minutes: 75,
    is_featured: false,
    description: "Locs detox from £35+.",
  },
  {
    name: "Locs Retwist",
    category: "Locs",
    price: 55,
    duration_minutes: 120,
    is_featured: true,
    target_audience: "Loc wearers needing maintenance",
    description: "Locs retwist from £55+.",
  },
  {
    name: "Locs Interlocking",
    category: "Locs",
    price: 70,
    duration_minutes: 150,
    is_featured: true,
    description: "Interlocking from £70+.",
  },
  {
    name: "Locs Repair",
    category: "Locs",
    price: 10,
    duration_minutes: 30,
    is_featured: false,
    description: "Loc repair from £10+.",
  },
  {
    name: "Barrel Twist",
    category: "Locs",
    price: 15,
    duration_minutes: 45,
    is_featured: false,
    description: "Barrel twist from £15+.",
  },
  {
    name: "Two Strand Twist",
    category: "Locs",
    price: 20,
    duration_minutes: 60,
    is_featured: false,
    description: "Two strand twist £20–£25.",
  },
  {
    name: "Trim / Small Cut",
    category: "Cuts",
    price: 7,
    duration_minutes: 20,
    is_featured: false,
    description: "A small cut, carefully placed — from £7.",
  },
  {
    name: "Hair Restoration Treatment",
    category: "Treatments",
    price: 35,
    duration_minutes: 90,
    is_featured: false,
    description:
      "Restoration from the roots out — from £35+. Includes washing and blowdry.",
  },
  {
    name: "Men's Twist",
    category: "For Men",
    price: 45,
    duration_minutes: 90,
    is_featured: false,
    target_audience: "Men wanting twists or plaits",
    description: "Men’s twist from £45+.",
  },
  {
    name: "Men's Plaits",
    category: "For Men",
    price: 45,
    duration_minutes: 90,
    is_featured: false,
    description: "Men’s plaits from £45+.",
  },
];

const preciseServices = [
  {
    name: "Domestic Cleaning",
    category: "Domestic",
    price: 70,
    duration_minutes: 180,
    is_featured: true,
    target_audience: "Homeowners and busy households across Nottingham",
    description:
      "Regular and one-off home cleaning tailored to your routine. Indicative fortnightly cleans often from around £70–£90 depending on property size. Final quote confirmed within 24 hours.",
  },
  {
    name: "One-off Deep Clean",
    category: "Domestic",
    price: 120,
    duration_minutes: 300,
    is_featured: false,
    target_audience: "Homes needing a thorough reset",
    description:
      "One-off deep clean for kitchens, bathrooms and living spaces. Quote based on rooms and condition.",
  },
  {
    name: "Commercial Cleaning",
    category: "Commercial",
    price: null,
    duration_minutes: 240,
    is_featured: true,
    target_audience: "Offices and workplaces",
    description:
      "Professional cleaning for offices, workplaces and busy businesses across Nottingham. Risk-assessed, insured teams.",
  },
  {
    name: "Student Accommodation Cleaning",
    category: "Domestic",
    price: null,
    duration_minutes: 180,
    is_featured: false,
    target_audience: "Students and student landlords",
    description:
      "Cleaning for student houses and HMOs across Nottingham — regular or end-of-year resets.",
  },
  {
    name: "End of Tenancy Cleaning",
    category: "End of Tenancy",
    price: null,
    duration_minutes: 360,
    is_featured: true,
    target_audience: "Landlords, tenants and letting agents",
    description:
      "Comprehensive move-in and move-out cleans designed to help win deposits back. Trusted by letting agents including Kingswood Residential.",
  },
  {
    name: "Carpet Cleaning",
    category: "Specialist",
    price: null,
    duration_minutes: 120,
    is_featured: false,
    target_audience: "Homes and offices with carpeted spaces",
    description: "Professional carpet stain removal and fabric care.",
  },
  {
    name: "Upholstery Cleaning",
    category: "Specialist",
    price: null,
    duration_minutes: 90,
    is_featured: false,
    description: "Sofa and upholstery cleaning with professional stain removal.",
  },
];

const allHairGoals = [
  {
    key: "increase_bookings",
    title: "Increase salon bookings",
    description:
      "Drive more appointments across Peveril Street and Alfreton Road via Instagram, Facebook and TikTok.",
    target_metric: "Weekly booked appointments",
  },
  {
    key: "promote_service",
    title: "Promote key texture services",
    description:
      "Spotlight braids, locs, weaves and natural hair services with clear booking CTAs.",
    target_metric: "Service-page / booking-link clicks",
  },
  {
    key: "increase_brand_awareness",
    title: "Grow Nottingham brand awareness",
    description:
      "Build recognition as Nottingham’s texture specialists — Texture. Craft. Nottingham.",
    target_metric: "Reach and profile visits",
  },
  {
    key: "increase_repeat_customers",
    title: "Increase repeat clients",
    description:
      "Encourage retwists, maintenance and return visits with retention-led content.",
    target_metric: "Returning client bookings",
  },
];

const preciseGoals = [
  {
    key: "increase_enquiries",
    title: "Increase cleaning enquiries",
    description:
      "Generate quote requests for domestic, commercial and end-of-tenancy cleans across Nottingham.",
    target_metric: "Quote form / call enquiries per week",
  },
  {
    key: "increase_website_traffic",
    title: "Grow website quote traffic",
    description:
      "Send social traffic to precisecleaningltd.com for instant estimates and 24-hour quotes.",
    target_metric: "Website sessions from social",
  },
  {
    key: "promote_service",
    title: "Promote core cleaning services",
    description:
      "Rotate domestic, commercial, end-of-tenancy and carpet/upholstery offers.",
    target_metric: "Service-specific enquiry rate",
  },
  {
    key: "increase_brand_awareness",
    title: "Build trusted local brand",
    description:
      "Reinforce insured, DBS-checked, eco-friendly positioning and 4.7 Google rating.",
    target_metric: "Brand search / local reach",
  },
];

// --- All Hair complete update ---
let allHairLogo = null;
try {
  allHairLogo = await uploadLogoFromUrl(
    ALL_HAIR,
    "https://allhairandbeautysalon.com/logo-full-360.webp",
    "logo-full-360.webp"
  );
} catch (e) {
  console.warn("All Hair logo skipped:", e.message);
}

const { error: ahOrgErr } = await sb
  .from("organisations")
  .update({
    name: "All Hair & Beauty",
    slug: "all-hair-beauty",
    business_category: "Hair & Beauty",
    description:
      "Texture specialists in Nottingham. Braids, locs, weaves, colour and natural hair across two salons — Peveril Street (Radford) and Alfreton Road (Hyson Green). Texture. Craft. Nottingham.",
    location: "Nottingham, United Kingdom",
    country: "United Kingdom",
    website: "https://allhairandbeautysalon.com",
    booking_url: "https://allhairandbeautysalon.com/book",
    phone: "+447855054241",
    email: "info@allhairandbeautysalon.com",
    opening_hours: allHairHours,
    timezone: "Europe/London",
    primary_marketing_goal_key: "increase_bookings",
    onboarding_step: "complete",
    onboarding_completed_at: new Date().toISOString(),
    onboarding_skipped: [],
    ...(allHairLogo ? { logo_path: allHairLogo } : {}),
  })
  .eq("id", ALL_HAIR);
if (ahOrgErr) throw new Error(ahOrgErr.message);

const { error: ahBrandErr } = await sb
  .from("brand_profiles")
  .update({
    brand_voice: "Warm",
    tone: "Warm, specialist, confident",
    target_audience:
      "People in Nottingham seeking expert braids, locs, cornrows, weaves, colour and natural hair care — especially clients who want texture considered at every step.",
    business_description:
      "All Hair & Beauty is a Nottingham texture specialist with chairs at 26 Peveril Street, Radford (NG7 4AL, 07855 054241) and 116–118 Alfreton Road, Hyson Green (NG7 3NS, 07577 118434). Services: braids, washing, cornrows, weave, straightening & curling, colouring, kids, crochet, locs, cuts, treatments and men’s twists/plaits. Also Salon JA62 hair care and texture training. Instagram @allhairandbeauty · TikTok @allhairandbeautysalon.",
    marketing_objectives:
      "increase_bookings, promote_service, increase_brand_awareness, increase_repeat_customers",
    preferred_terminology:
      "texture, braids, knotless, goddess braids, locs, retwist, interlocking, cornrows, weave, natural hair, consultation, Nottingham, Radford, Hyson Green",
    words_to_avoid:
      "cheap, bargain, generic salon, one-size-fits-all, chemical-heavy language, discount-bin tone",
    primary_color: "#1B2B23",
    secondary_color: "#C4A574",
    typography_preferences: {
      display: "Editorial / craft",
      body: "Clean sans",
      notes: "Match site feel: confident, minimal, texture-first — not corporate purple SaaS.",
    },
    custom_instructions:
      "Always mention Nottingham and texture expertise. Brand line: Texture. Craft. Nottingham. Prefer booking CTA to https://allhairandbeautysalon.com/book. Two locations with hours Mon–Fri 09:00–19:00, Sat 08:30–18:00, Sun closed. Use platform-native captions; Instagram/TikTok visual-first. Do not invent prices beyond published + guides.",
    ...(allHairLogo ? { logo_path: allHairLogo } : {}),
  })
  .eq("organisation_id", ALL_HAIR);
if (ahBrandErr) throw new Error(ahBrandErr.message);

const { error: ahAudErr } = await sb
  .from("audience_profiles")
  .update({
    age_range: "16–45",
    location_focus:
      "Nottingham, Radford, Hyson Green, NG7, Nottinghamshire and nearby Midlands clients willing to travel for texture specialists",
    interests: [
      "braids",
      "locs",
      "natural hair",
      "protective styles",
      "weaves",
      "beauty",
      "self-care",
      "afro haircare",
      "TikTok hair content",
    ],
    customer_types: [
      "local residents",
      "students",
      "young professionals",
      "parents booking kids’ styles",
      "men seeking twists/plaits",
      "loc wearers",
    ],
    income_lifestyle:
      "Invest in specialist craft and consultation; choose quality texture work over the cheapest chair",
    ideal_customer_description:
      "Nottingham clients who want expert braids, locs, weaves or natural hair styling from a texture-first salon — not a generic cut-and-blowdry. They book via the website and follow @allhairandbeauty for finished looks.",
    additional_notes:
      "Two doors: Peveril Street Radford (+447855054241) and Alfreton Road Hyson Green (+447577118434). Email info@allhairandbeautysalon.com. Prices with + are guides confirmed in consultation.",
  })
  .eq("organisation_id", ALL_HAIR);
if (ahAudErr) throw new Error(ahAudErr.message);

await upsertGoals(ALL_HAIR, allHairGoals, "increase_bookings");
await replaceServices(ALL_HAIR, allHairServices);
await upsertAutomation(ALL_HAIR, {
  enabled: false,
  paused: false,
  mode: "approval",
  posts_per_week: 5,
  stories_per_week: 3,
  reels_per_week: 3,
  platforms: ["instagram", "facebook", "tiktok"],
  content_preferences: [
    "promotional",
    "educational",
    "engagement",
    "brand_awareness",
    "behind_the_scenes",
    "services",
    "community",
  ],
  primary_goals: [
    "increase_bookings",
    "promote_service",
    "increase_brand_awareness",
    "increase_repeat_customers",
  ],
  quiet_hours: { start: "21:00", end: "08:00" },
  max_auto_publishes_per_day: 2,
  pipeline_horizon_days: 7,
  ai_freedom_level: "balanced",
  current_state: "off",
  state_message: "Profile complete — enable automation when ready",
  setup_completed_at: new Date().toISOString(),
});

await sb
  .from("organisations")
  .update({ autopilot_mode: "approval_required" })
  .eq("id", ALL_HAIR);

// --- Precise complete update ---
let preciseLogo = null;
try {
  // Try common logo paths; site may use different asset
  const candidates = [
    "https://precisecleaningltd.com/logo.png",
    "https://precisecleaningltd.com/favicon.ico",
    "https://precisecleaningltd.com/apple-touch-icon.png",
  ];
  for (const url of candidates) {
    try {
      const head = await fetch(url, { method: "GET" });
      if (head.ok) {
        const ext = url.includes(".ico")
          ? "favicon.ico"
          : url.includes("apple")
            ? "apple-touch-icon.png"
            : "logo.png";
        preciseLogo = await uploadLogoFromUrl(PRECISE, url, ext);
        break;
      }
    } catch {
      /* try next */
    }
  }
} catch (e) {
  console.warn("Precise logo skipped:", e.message);
}

const { error: pcOrgErr } = await sb
  .from("organisations")
  .update({
    name: "Precise Cleaning Limited",
    slug: "precise-cleaning",
    business_category: "Cleaning",
    description:
      "Professional domestic and commercial cleaning across Nottingham and Nottinghamshire. Fully insured (£5m public liability), DBS-checked uniformed teams, eco-friendly products, free quote within 24 hours, and a 72-hour satisfaction guarantee. Rated 4.7 on Google. Based in Radford, NG7.",
    location: "26 Peveril Street, Radford, Nottingham NG7 4AL, United Kingdom",
    country: "United Kingdom",
    website: "https://precisecleaningltd.com",
    booking_url: "https://precisecleaningltd.com",
    phone: "+447832408348",
    email: "info@precisecleaningltd.com",
    opening_hours: preciseHours,
    timezone: "Europe/London",
    primary_marketing_goal_key: "increase_enquiries",
    onboarding_step: "complete",
    onboarding_completed_at: new Date().toISOString(),
    onboarding_skipped: [],
    autopilot_mode: "approval_required",
    created_by: OWNER,
    ...(preciseLogo ? { logo_path: preciseLogo } : {}),
  })
  .eq("id", PRECISE);
if (pcOrgErr) throw new Error(pcOrgErr.message);

const { error: pcBrandErr } = await sb
  .from("brand_profiles")
  .update({
    brand_voice: "Professional",
    tone: "Professional, trustworthy, friendly",
    target_audience:
      "Homeowners, landlords, tenants, letting agents, offices and commercial properties across Nottingham and Nottinghamshire who want insured, DBS-checked cleaning with a clear fixed quote.",
    business_description:
      "Precise Cleaning Limited is based at 26 Peveril Street, Radford, Nottingham NG7 4AL. Services: domestic cleaning, commercial cleaning, student accommodation, end of tenancy, carpet and upholstery cleaning. £5m public liability insurance, DBS-checked uniformed staff, eco-friendly family-safe products, free quote in under 24 hours, free survey for larger jobs, and a 72-hour put-it-right guarantee. 4.7★ on Google.",
    marketing_objectives:
      "increase_enquiries, increase_website_traffic, promote_service, increase_brand_awareness",
    preferred_terminology:
      "fully insured, DBS-checked, end of tenancy, domestic cleaning, commercial cleaning, free quote, Nottingham, eco-friendly, satisfaction guarantee, 4.7 Google",
    words_to_avoid:
      "cheap, cowboy, uninsured, bargain basement, dirty jobs slang, aggressive hard-sell",
    primary_color: "#0B5FFF",
    secondary_color: "#0F172A",
    typography_preferences: {
      display: "Clean modern sans",
      body: "Readable sans",
      notes: "Trust-first local services look — crisp blues/dark neutrals, not luxury serif.",
    },
    custom_instructions:
      "Lead with trust signals: insured, DBS-checked, eco-friendly, satisfaction guarantee, 4.7 Google. CTA = get a quote at https://precisecleaningltd.com (quote in under 24 hours). Phone 07832 408348 · info@precisecleaningltd.com · 26 Peveril Street, Radford, NG7 4AL. Cover Nottingham & Nottinghamshire. Never invent exact prices for commercial/EOT — invite a free quote.",
    ...(preciseLogo ? { logo_path: preciseLogo } : {}),
  })
  .eq("organisation_id", PRECISE);
if (pcBrandErr) throw new Error(pcBrandErr.message);

const { error: pcAudErr } = await sb
  .from("audience_profiles")
  .update({
    age_range: "25–60",
    location_focus:
      "Nottingham city centre, Radford, NG7, surrounding Nottinghamshire towns and villages",
    interests: [
      "home maintenance",
      "property management",
      "office facilities",
      "moving house",
      "local services",
      "landlord compliance",
      "eco-friendly cleaning",
    ],
    customer_types: [
      "homeowners",
      "landlords",
      "tenants",
      "letting agents",
      "offices",
      "student accommodation managers",
      "commercial property managers",
    ],
    income_lifestyle:
      "Busy households and property professionals who value reliability, insurance cover and clear pricing over the cheapest quote",
    ideal_customer_description:
      "Nottingham homes and businesses that need a trusted, insured cleaner — regular domestic, commercial, student housing or end-of-tenancy — with a fixed quote in under 24 hours and a satisfaction guarantee.",
    additional_notes:
      "Strong end-of-tenancy reputation with letting agents. Instant price estimate on website; final quote confirmed within 24 hours. £5m PL insurance. Call 07832 408348.",
  })
  .eq("organisation_id", PRECISE);
if (pcAudErr) throw new Error(pcAudErr.message);

await upsertGoals(PRECISE, preciseGoals, "increase_enquiries");
await replaceServices(PRECISE, preciseServices);
await upsertAutomation(PRECISE, {
  enabled: false,
  paused: false,
  mode: "approval",
  posts_per_week: 4,
  stories_per_week: 2,
  reels_per_week: 2,
  platforms: ["instagram", "facebook"],
  content_preferences: [
    "promotional",
    "educational",
    "engagement",
    "brand_awareness",
    "services",
    "community",
  ],
  primary_goals: [
    "increase_enquiries",
    "increase_website_traffic",
    "promote_service",
    "increase_brand_awareness",
  ],
  quiet_hours: { start: "20:00", end: "08:00" },
  max_auto_publishes_per_day: 2,
  pipeline_horizon_days: 7,
  ai_freedom_level: "balanced",
  current_state: "off",
  state_message: "Profile complete — enable automation when ready",
  setup_completed_at: new Date().toISOString(),
});

// Verify completeness
const report = [];
for (const [name, id] of [
  ["All Hair & Beauty", ALL_HAIR],
  ["Precise Cleaning Limited", PRECISE],
]) {
  const { data: org } = await sb.from("organisations").select("*").eq("id", id).single();
  const { data: brand } = await sb
    .from("brand_profiles")
    .select("*")
    .eq("organisation_id", id)
    .single();
  const { data: audience } = await sb
    .from("audience_profiles")
    .select("*")
    .eq("organisation_id", id)
    .single();
  const { count: serviceCount } = await sb
    .from("products_services")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", id);
  const { count: goalCount } = await sb
    .from("marketing_goals")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", id)
    .eq("status", "active");
  const { data: auto } = await sb
    .from("automation_settings")
    .select("mode,setup_completed_at,primary_goals,platforms")
    .eq("organisation_id", id)
    .maybeSingle();

  const orgNulls = Object.entries(org)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
    .filter(
      (k) =>
        ![
          "subscription_status",
          // logos may still be null if fetch failed
        ].includes(k)
    );
  const brandNulls = Object.entries(brand)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  const audNulls = Object.entries(audience)
    .filter(([, v]) => v === null || (Array.isArray(v) && v.length === 0))
    .map(([k]) => k);

  report.push({
    name,
    id,
    website: org.website,
    booking_url: org.booking_url,
    opening_hours: org.opening_hours,
    logo_path: org.logo_path,
    services: serviceCount,
    goals: goalCount,
    automation: auto,
    remainingNulls: { org: orgNulls, brand: brandNulls, audience: audNulls },
  });
}

console.log(JSON.stringify(report, null, 2));
