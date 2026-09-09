import type { createClient } from "@/lib/supabase/server";
import type { InsightsResult } from "@/lib/ai/schemas";
import type { WeeklyReviewResult } from "@/lib/ai/schemas";
import type { PerformanceSnapshot } from "@/lib/analytics/types";
import { snapshotForAi } from "@/lib/analytics/snapshot";
import type { Json } from "@/lib/database.types";
import type { MarketingGoalKey } from "@/lib/ai/goals";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function persistPerformanceAnalysis(input: {
  supabase: Supabase;
  organisationId: string;
  userId: string;
  snapshot: PerformanceSnapshot;
  insights: InsightsResult;
  model: string | null;
}) {
  const { supabase, organisationId, userId, snapshot, insights, model } =
    input;

  const { data: run } = await supabase
    .from("marketing_analysis_runs")
    .insert({
      organisation_id: organisationId,
      run_type: "performance",
      period_start: snapshot.range.start,
      period_end: snapshot.range.end,
      goal_key: snapshot.goalKey,
      data_snapshot: snapshotForAi(snapshot) as Json,
      summary: insights.summary,
      health_score: snapshot.health.score,
      confidence: snapshot.dataQuality.confidence,
      model,
      created_by: userId,
    })
    .select("id")
    .single();

  await supabase
    .from("marketing_health_scores")
    .insert({
      organisation_id: organisationId,
      analysis_run_id: run?.id ?? null,
      period_start: snapshot.range.start,
      period_end: snapshot.range.end,
      goal_key: snapshot.goalKey,
      score: snapshot.health.score,
      previous_score: snapshot.health.previousScore,
      delta: snapshot.health.delta,
      components: snapshot.health.components as Json,
      main_improvement: snapshot.health.mainImprovement,
      main_opportunity: snapshot.health.mainOpportunity,
      explanation: snapshot.health.explanation,
    });

  await supabase
    .from("ai_insights")
    .update({ is_active: false })
    .eq("organisation_id", organisationId)
    .eq("is_active", true);

  const rows = [
    ...insights.insights.map((insight) => ({
      organisation_id: organisationId,
      insight_text: insight.text,
      insight_type: insights.insufficient_data
        ? "insufficient_data"
        : "insight",
      confidence: insight.confidence,
      based_on: {
        summary: insights.summary,
        period: snapshot.range,
        goal: snapshot.goalKey,
      } as Json,
      action_label: insight.action_label || null,
      action_href: insight.action_href || null,
      title: null as string | null,
      explanation: null as string | null,
      evidence: null as string | null,
      priority: null as string | null,
      goal_key: snapshot.goalKey,
      period_start: snapshot.range.start,
      period_end: snapshot.range.end,
      analysis_run_id: run?.id ?? null,
      created_by: userId,
    })),
    ...insights.recommendations.map((rec) => ({
      organisation_id: organisationId,
      insight_text: `${rec.title}: ${rec.explanation}`,
      insight_type: "recommendation",
      confidence: rec.confidence,
      based_on: {
        evidence: rec.evidence,
        summary: insights.summary,
        period: snapshot.range,
        goal: snapshot.goalKey,
      } as Json,
      action_label: rec.action_label,
      action_href: rec.action_href,
      title: rec.title,
      explanation: rec.explanation,
      evidence: rec.evidence,
      priority: rec.priority,
      goal_key: snapshot.goalKey,
      period_start: snapshot.range.start,
      period_end: snapshot.range.end,
      analysis_run_id: run?.id ?? null,
      created_by: userId,
    })),
  ];

  if (rows.length) {
    await supabase.from("ai_insights").insert(rows);
  }

  return { analysisRunId: run?.id ?? null };
}

export async function persistWeeklyReview(input: {
  supabase: Supabase;
  organisationId: string;
  userId: string;
  snapshot: PerformanceSnapshot;
  review: WeeklyReviewResult;
  model: string | null;
}) {
  const { supabase, organisationId, userId, snapshot, review, model } = input;

  const { data: run } = await supabase
    .from("marketing_analysis_runs")
    .insert({
      organisation_id: organisationId,
      run_type: "weekly_review",
      period_start: snapshot.range.start,
      period_end: snapshot.range.end,
      goal_key: snapshot.goalKey,
      data_snapshot: snapshotForAi(snapshot) as Json,
      summary: review.what_happened,
      health_score: snapshot.health.score,
      confidence: review.confidence,
      model,
      created_by: userId,
    })
    .select("id")
    .single();

  await supabase.from("marketing_weekly_reviews").upsert(
    {
      organisation_id: organisationId,
      analysis_run_id: run?.id ?? null,
      week_start: snapshot.range.start,
      week_end: snapshot.range.end,
      goal_key: snapshot.goalKey,
      what_happened: review.what_happened,
      what_worked: review.what_worked,
      what_didnt: review.what_didnt,
      what_we_learned: review.what_we_learned,
      what_to_do_next: review.what_to_do_next,
      recommendations: review.recommendations as Json,
      confidence: review.confidence,
      data_snapshot: snapshotForAi(snapshot) as Json,
      created_by: userId,
    },
    { onConflict: "organisation_id,week_start" }
  );

  return { analysisRunId: run?.id ?? null };
}

export async function setPrimaryMarketingGoal(input: {
  supabase: Supabase;
  organisationId: string;
  goalKey: MarketingGoalKey;
}) {
  await input.supabase
    .from("organisations")
    .update({ primary_marketing_goal_key: input.goalKey })
    .eq("id", input.organisationId);

  const { data: existing } = await input.supabase
    .from("marketing_goals")
    .select("id")
    .eq("organisation_id", input.organisationId)
    .eq("goal_key", input.goalKey)
    .eq("status", "active")
    .maybeSingle();

  if (!existing) {
    await input.supabase.from("marketing_goals").insert({
      organisation_id: input.organisationId,
      goal_key: input.goalKey,
      title: input.goalKey.replaceAll("_", " "),
      status: "active",
    });
  }
}
