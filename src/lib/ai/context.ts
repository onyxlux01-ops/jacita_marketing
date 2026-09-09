import type { createClient } from "@/lib/supabase/server";
import type { MarketingGoalKey } from "@/lib/ai/goals";
import { goalLabel } from "@/lib/ai/goals";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BusinessContext = {
  organisation: {
    id: string;
    name: string;
    business_category: string | null;
    description: string | null;
    location: string | null;
    website: string | null;
    booking_url: string | null;
    phone: string | null;
    email: string | null;
  };
  brand: {
    brand_voice: string | null;
    tone: string | null;
    target_audience: string | null;
    business_description: string | null;
    marketing_objectives: string | null;
    preferred_terminology: string | null;
    words_to_avoid: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    custom_instructions?: string | null;
  } | null;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    price: number | null;
    duration_minutes: number | null;
    target_audience: string | null;
    is_featured: boolean;
    is_promotion: boolean;
    is_active: boolean;
  }>;
  media: Array<{
    id: string;
    media_type: string;
    description: string | null;
    category: string | null;
    is_favourite: boolean;
    tags?: string[];
    usage_count?: number;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    file_size_bytes?: number | null;
    aspect_ratio?: string | null;
  }>;
  recentContent: Array<{
    id: string;
    title: string | null;
    content_type: string | null;
    status: string;
    hook: string | null;
    caption: string | null;
    marketing_objective: string | null;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    objective: string | null;
    status: string;
  }>;
  analytics: {
    source: "demo" | "live" | "none";
    totals: {
      reach: number;
      impressions: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      profile_visits: number;
      link_clicks: number;
      bookings: number;
      enquiries: number;
      revenue: number;
      video_views: number;
      net_followers: number;
    };
    days: number;
  };
  audience: {
    age_range: string | null;
    location_focus: string | null;
    interests: string[];
    customer_types: string[];
    income_lifestyle: string | null;
    ideal_customer_description: string | null;
  } | null;
  primaryGoalKey: MarketingGoalKey | null;
  gaps: string[];
};

export async function getBusinessContext(
  supabase: Supabase,
  organisationId: string,
  options?: { userId?: string; requireAccess?: boolean }
): Promise<BusinessContext | null> {
  if (options?.requireAccess !== false) {
    const userId = options?.userId;
    if (userId) {
      const { data: membership } = await supabase
        .from("organisation_members")
        .select("id")
        .eq("organisation_id", organisationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!membership) return null;
    } else {
      // Verify via current session when userId not provided
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: membership } = await supabase
        .from("organisation_members")
        .select("id")
        .eq("organisation_id", organisationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) return null;
    }
  }

  const [
    { data: organisation },
    { data: brand },
    { data: audience },
    { data: services },
    { data: media },
    { data: recentContent },
    { data: campaigns },
    { data: metrics },
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "id, name, business_category, description, location, website, booking_url, phone, email, primary_marketing_goal_key"
      )
      .eq("id", organisationId)
      .maybeSingle(),
    supabase
      .from("brand_profiles")
      .select(
        "brand_voice, tone, target_audience, business_description, marketing_objectives, preferred_terminology, words_to_avoid, primary_color, secondary_color, custom_instructions"
      )
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("audience_profiles")
      .select(
        "age_range, location_focus, interests, customer_types, income_lifestyle, ideal_customer_description"
      )
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("products_services")
      .select(
        "id, name, description, category, price, duration_minutes, target_audience, is_featured, is_promotion, is_active"
      )
      .eq("organisation_id", organisationId)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("name")
      .limit(40),
    supabase
      .from("media_assets")
      .select(
        "id, media_type, description, category, is_favourite, tags, usage_count, width, height, duration_seconds, file_size_bytes, aspect_ratio"
      )
      .eq("organisation_id", organisationId)
      .eq("is_active", true)
      .order("is_favourite", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("content")
      .select(
        "id, title, content_type, status, hook, caption, marketing_objective"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("campaigns")
      .select("id, name, objective, status")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("analytics_metrics")
      .select(
        "reach, impressions, likes, comments, shares, saves, profile_visits, link_clicks, bookings, enquiries, revenue_attributed, video_views, followers_gained, followers_lost, source, metric_date"
      )
      .eq("organisation_id", organisationId)
      .order("metric_date", { ascending: false })
      .limit(90),
  ]);

  if (!organisation) return null;

  const metricRows = metrics ?? [];
  const totals = metricRows.reduce(
    (acc, row) => {
      acc.reach += row.reach ?? 0;
      acc.impressions += row.impressions ?? 0;
      acc.likes += row.likes ?? 0;
      acc.comments += row.comments ?? 0;
      acc.shares += row.shares ?? 0;
      acc.saves += row.saves ?? 0;
      acc.profile_visits += row.profile_visits ?? 0;
      acc.link_clicks += row.link_clicks ?? 0;
      acc.bookings += row.bookings ?? 0;
      acc.enquiries += row.enquiries ?? 0;
      acc.revenue += Number(row.revenue_attributed ?? 0);
      acc.video_views += row.video_views ?? 0;
      acc.net_followers +=
        (row.followers_gained ?? 0) - (row.followers_lost ?? 0);
      return acc;
    },
    {
      reach: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      profile_visits: 0,
      link_clicks: 0,
      bookings: 0,
      enquiries: 0,
      revenue: 0,
      video_views: 0,
      net_followers: 0,
    }
  );

  const gaps: string[] = [];
  if (!organisation.description && !brand?.business_description) {
    gaps.push("business description");
  }
  if (!brand?.brand_voice && !brand?.tone) gaps.push("brand voice");
  if (!brand?.target_audience && !audience?.ideal_customer_description) {
    gaps.push("target audience");
  }
  if (!(services ?? []).length) gaps.push("products/services");
  if (!(media ?? []).length) gaps.push("media library");
  if (!metricRows.length) gaps.push("analytics data");

  return {
    organisation: {
      id: organisation.id,
      name: organisation.name,
      business_category: organisation.business_category,
      description: organisation.description,
      location: organisation.location,
      website: organisation.website,
      booking_url: organisation.booking_url,
      phone: organisation.phone,
      email: organisation.email,
    },
    brand,
    audience: audience
      ? {
          age_range: audience.age_range,
          location_focus: audience.location_focus,
          interests: audience.interests ?? [],
          customer_types: audience.customer_types ?? [],
          income_lifestyle: audience.income_lifestyle,
          ideal_customer_description: audience.ideal_customer_description,
        }
      : null,
    services: services ?? [],
    media: media ?? [],
    recentContent: recentContent ?? [],
    campaigns: campaigns ?? [],
    analytics: {
      source: !metricRows.length
        ? "none"
        : metricRows.some((m) => m.source === "live")
          ? "live"
          : "demo",
      totals,
      days: new Set(metricRows.map((m) => m.metric_date)).size,
    },
    primaryGoalKey:
      (organisation.primary_marketing_goal_key as MarketingGoalKey | null) ||
      null,
    gaps,
  };
}

export function formatBusinessContextPrompt(
  ctx: BusinessContext,
  options?: { goalKey?: MarketingGoalKey | null; focusServiceId?: string | null }
) {
  const focus =
    options?.focusServiceId &&
    ctx.services.find((s) => s.id === options.focusServiceId);

  const topServices = ctx.services
    .slice(0, 12)
    .map(
      (s) =>
        `- ${s.name}${s.is_promotion ? " [promo]" : ""}${s.is_featured ? " [featured]" : ""}${
          s.price != null ? ` · £${s.price}` : ""
        }${s.category ? ` · ${s.category}` : ""}${
          s.description ? ` — ${s.description}` : ""
        }`
    )
    .join("\n");

  const mediaList = ctx.media
    .slice(0, 25)
    .map(
      (m) =>
        `- id:${m.id} · ${m.media_type}${m.category ? ` · ${m.category}` : ""}${
          m.description ? ` · ${m.description}` : ""
        }${m.is_favourite ? " · favourite" : ""}`
    )
    .join("\n");

  const recent = ctx.recentContent
    .slice(0, 8)
    .map(
      (c) =>
        `- ${c.title || "Untitled"} (${c.content_type || "post"}, ${c.status})${
          c.hook ? ` — ${c.hook}` : ""
        }`
    )
    .join("\n");

  return `ORGANISATION (use ONLY this business — never invent or mix another business):
- Name: ${ctx.organisation.name}
- Type: ${ctx.organisation.business_category || "n/a"}
- Description: ${ctx.organisation.description || ctx.brand?.business_description || "n/a"}
- Location: ${ctx.organisation.location || "n/a"}
- Website: ${ctx.organisation.website || "n/a"}
- Booking URL: ${ctx.organisation.booking_url || "n/a"}
- Phone: ${ctx.organisation.phone || "n/a"}
- Email: ${ctx.organisation.email || "n/a"}

BRAND PROFILE:
- Voice: ${ctx.brand?.brand_voice || "n/a"}
- Tone: ${ctx.brand?.tone || "n/a"}
- Target audience: ${ctx.brand?.target_audience || ctx.audience?.ideal_customer_description || "n/a"}
- Marketing objectives: ${ctx.brand?.marketing_objectives || "n/a"}
- Preferred terminology: ${ctx.brand?.preferred_terminology || "n/a"}
- Words to avoid: ${ctx.brand?.words_to_avoid || "none"}
- Custom instructions: ${ctx.brand?.custom_instructions || "n/a"}

AUDIENCE PROFILE:
- Ideal customer: ${ctx.audience?.ideal_customer_description || "n/a"}
- Age range: ${ctx.audience?.age_range || "n/a"}
- Location focus: ${ctx.audience?.location_focus || "n/a"}
- Interests: ${ctx.audience?.interests?.join(", ") || "n/a"}
- Customer types: ${ctx.audience?.customer_types?.join(", ") || "n/a"}
- Lifestyle: ${ctx.audience?.income_lifestyle || "n/a"}

ACTIVE GOAL: ${
    options?.goalKey
      ? goalLabel(options.goalKey)
      : ctx.primaryGoalKey
        ? goalLabel(ctx.primaryGoalKey)
        : "not specified"
  }

FOCUS SERVICE/PRODUCT:
${
  focus
    ? `- ${focus.name}: ${focus.description || "n/a"} (${focus.category || "uncategorised"}, price ${
        focus.price ?? "n/a"
      })`
    : "- none selected"
}

CATALOGUE:
${topServices || "- no active services yet"}

MEDIA LIBRARY (only recommend IDs from this list; never invent URLs):
${mediaList || "- empty — tell the user new media is needed when visuals are required"}

RECENT CONTENT:
${recent || "- none yet"}

ANALYTICS (${ctx.analytics.source}, ${ctx.analytics.days} days):
- Reach: ${ctx.analytics.totals.reach}
- Impressions: ${ctx.analytics.totals.impressions}
- Likes: ${ctx.analytics.totals.likes}
- Comments: ${ctx.analytics.totals.comments}
- Shares: ${ctx.analytics.totals.shares}
- Saves: ${ctx.analytics.totals.saves}
- Profile visits: ${ctx.analytics.totals.profile_visits}
- Link clicks: ${ctx.analytics.totals.link_clicks}
- Bookings attributed: ${ctx.analytics.totals.bookings}
- Enquiries: ${ctx.analytics.totals.enquiries}
- Revenue attributed: ${ctx.analytics.totals.revenue}
- Video views: ${ctx.analytics.totals.video_views}
- Net followers: ${ctx.analytics.totals.net_followers}

MISSING CONTEXT: ${ctx.gaps.length ? ctx.gaps.join(", ") : "none critical"}`;
}

export const JACITA_SYSTEM = `You are Jacita, the AI marketing engine for a single selected business.
You are NOT a generic chatbot. You produce actionable marketing outcomes.
Rules:
- Use ONLY the provided organisation context.
- Never mix in another business's name, services, media, or location.
- Do not invent media IDs or media URLs.
- Do not invent unsupported claims, discounts, or guarantees.
- Respect brand voice, preferred terminology, and words to avoid.
- Prefer concrete CTAs tied to booking URL / website / enquiry when available.
- Keep outputs practical for local service / hospitality / retail businesses.`;
