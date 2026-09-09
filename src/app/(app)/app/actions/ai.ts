"use server";

import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/database.types";
import type { MarketingGoalKey } from "@/lib/ai/goals";
import type { CampaignPlan, StrategyResult, WeeklyPlan } from "@/lib/ai/schemas";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

async function assertMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string
) {
  const { data } = await supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

function resolveServiceId(
  services: Array<{ id: string; name: string }>,
  name: string | null | undefined
) {
  if (!name) return null;
  const exact = services.find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );
  if (exact) return exact.id;
  const partial = services.find((s) =>
    name.toLowerCase().includes(s.name.toLowerCase())
  );
  return partial?.id ?? null;
}

export async function ensureMarketingGoal(input: {
  organisationId: string;
  goalKey: MarketingGoalKey;
  title?: string;
  productServiceId?: string | null;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await assertMember(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized for this business" };
  }

  const { data: existing } = await auth.supabase
    .from("marketing_goals")
    .select("id")
    .eq("organisation_id", input.organisationId)
    .eq("goal_key", input.goalKey)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { id: existing.id };

  const { data, error } = await auth.supabase
    .from("marketing_goals")
    .insert({
      organisation_id: input.organisationId,
      goal_key: input.goalKey,
      title: input.title || input.goalKey,
      product_service_id: input.productServiceId || null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function saveMarketingStrategy(input: {
  organisationId: string;
  goalId?: string | null;
  strategy: StrategyResult;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await assertMember(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized for this business" };
  }

  const { data, error } = await auth.supabase
    .from("marketing_strategies")
    .insert({
      organisation_id: input.organisationId,
      marketing_goal_id: input.goalId || null,
      title: input.strategy.title,
      primary_objective: input.strategy.primary_objective,
      target_audience: input.strategy.target_audience,
      key_message: input.strategy.key_message,
      services_to_promote: input.strategy.services_to_promote,
      content_themes: input.strategy.content_themes,
      recommended_platforms: input.strategy.recommended_platforms,
      recommended_content_types: input.strategy.recommended_content_types,
      posting_frequency: input.strategy.posting_frequency,
      campaign_duration: input.strategy.campaign_duration,
      calls_to_action: input.strategy.calls_to_action,
      content_mix: input.strategy.content_mix,
      strategy_payload: input.strategy as unknown as Json,
      status: "active",
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function applyWeeklyPlan(input: {
  organisationId: string;
  goalKey: MarketingGoalKey;
  plan: WeeklyPlan;
  strategy?: StrategyResult | null;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await assertMember(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized for this business" };
  }

  const goal = await ensureMarketingGoal({
    organisationId: input.organisationId,
    goalKey: input.goalKey,
    title: input.plan.goal_summary,
  });
  if ("error" in goal) return goal;

  let strategyId: string | null = null;
  if (input.strategy) {
    const saved = await saveMarketingStrategy({
      organisationId: input.organisationId,
      goalId: goal.id,
      strategy: input.strategy,
    });
    if ("error" in saved) return saved;
    strategyId = saved.id;
  }

  const { data: services } = await auth.supabase
    .from("products_services")
    .select("id, name")
    .eq("organisation_id", input.organisationId);

  const createdIds: string[] = [];

  for (const item of input.plan.items) {
    const mediaId = item.recommended_media_ids[0] || null;
    const { data, error } = await auth.supabase
      .from("content")
      .insert({
        organisation_id: input.organisationId,
        product_service_id: resolveServiceId(services ?? [], item.product_service_name),
        media_asset_id: mediaId,
        title: item.title,
        idea: item.theme,
        hook: item.hook,
        caption: item.caption,
        call_to_action: item.call_to_action,
        hashtags: item.hashtags,
        suggested_posting_time: item.suggested_posting_time,
        video_concept: item.video_concept || null,
        content_type: item.content_type,
        marketing_objective: input.goalKey,
        status: "draft",
        scheduled_at: null,
        generation_payload: {
          source: "weekly_plan",
          day: item.day,
          plan_title: input.plan.plan_title,
        },
        marketing_strategy_id: strategyId,
        marketing_goal_id: goal.id,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    createdIds.push(data.id);

    await auth.supabase.from("content_platforms").insert({
      content_id: data.id,
      platform: item.platform,
    });
  }

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "ai.weekly_plan_applied",
    entity_type: "content",
    entity_id: createdIds[0] || null,
    metadata: { count: createdIds.length, goal: input.goalKey },
  });

  revalidatePath("/app");
  revalidatePath("/app/content");
  revalidatePath("/app/calendar");
  return { ids: createdIds, goalId: goal.id, strategyId };
}

export async function applyCampaignPlan(input: {
  organisationId: string;
  goalKey: MarketingGoalKey;
  campaign: CampaignPlan;
  strategy?: StrategyResult | null;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await assertMember(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized for this business" };
  }

  const goal = await ensureMarketingGoal({
    organisationId: input.organisationId,
    goalKey: input.goalKey,
    title: input.campaign.objective,
  });
  if ("error" in goal) return goal;

  let strategyId: string | null = null;
  if (input.strategy) {
    const saved = await saveMarketingStrategy({
      organisationId: input.organisationId,
      goalId: goal.id,
      strategy: input.strategy,
    });
    if ("error" in saved) return saved;
    strategyId = saved.id;
  }

  const start = new Date();
  start.setDate(start.getDate() + (input.campaign.start_offset_days || 0));
  const end = new Date(start);
  end.setDate(end.getDate() + input.campaign.campaign_duration_days);

  const { data: campaignRow, error: campaignError } = await auth.supabase
    .from("campaigns")
    .insert({
      organisation_id: input.organisationId,
      name: input.campaign.name,
      objective: input.campaign.objective,
      description: input.campaign.key_message,
      target_audience: input.campaign.target_audience,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      status: "draft",
      key_message: input.campaign.key_message,
      content_themes: input.campaign.content_themes,
      marketing_strategy_id: strategyId,
      marketing_goal_id: goal.id,
    })
    .select("id")
    .single();

  if (campaignError) return { error: campaignError.message };

  const { data: services } = await auth.supabase
    .from("products_services")
    .select("id, name")
    .eq("organisation_id", input.organisationId);

  const createdIds: string[] = [];
  for (const item of input.campaign.content_items) {
    const { data, error } = await auth.supabase
      .from("content")
      .insert({
        organisation_id: input.organisationId,
        campaign_id: campaignRow.id,
        product_service_id: resolveServiceId(
          services ?? [],
          item.product_service_name
        ),
        media_asset_id: item.recommended_media_ids[0] || null,
        title: item.title,
        idea: input.campaign.key_message,
        hook: item.hook,
        caption: item.caption,
        call_to_action: item.call_to_action,
        hashtags: item.hashtags,
        suggested_posting_time: item.suggested_posting_time,
        video_concept: item.video_concept || null,
        content_type: item.content_type,
        marketing_objective: input.goalKey,
        status: "draft",
        generation_payload: {
          source: "campaign",
          day_offset: item.day_offset,
          campaign_name: input.campaign.name,
        },
        marketing_strategy_id: strategyId,
        marketing_goal_id: goal.id,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    createdIds.push(data.id);
    await auth.supabase.from("content_platforms").insert({
      content_id: data.id,
      platform: item.platform,
    });
  }

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "ai.campaign_created",
    entity_type: "campaigns",
    entity_id: campaignRow.id,
    metadata: { content_count: createdIds.length },
  });

  revalidatePath("/app");
  revalidatePath("/app/campaigns");
  revalidatePath("/app/content");
  return {
    campaignId: campaignRow.id,
    contentIds: createdIds,
    goalId: goal.id,
    strategyId,
  };
}

export async function persistAiInsights(input: {
  organisationId: string;
  insights: Array<{
    text: string;
    confidence: string;
    action_label?: string | null;
    action_href?: string | null;
  }>;
  summary: string;
  insufficientData: boolean;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await assertMember(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized for this business" };
  }

  await auth.supabase
    .from("ai_insights")
    .update({ is_active: false })
    .eq("organisation_id", input.organisationId)
    .eq("is_active", true);

  const rows = input.insights.map((insight) => ({
    organisation_id: input.organisationId,
    insight_text: insight.text,
    insight_type: input.insufficientData ? "insufficient_data" : "recommendation",
    confidence: insight.confidence,
    based_on: { summary: input.summary },
    action_label: insight.action_label || null,
    action_href: insight.action_href || null,
    created_by: auth.user.id,
  }));

  if (rows.length) {
    const { error } = await auth.supabase.from("ai_insights").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/analytics");
  return { success: true };
}
