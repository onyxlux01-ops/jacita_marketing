import { NextResponse } from "next/server";
import {
  generateWeeklyPlan,
  getBusinessContext,
  mapLegacyObjective,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    organisation_id?: string;
    request_text?: string;
    goal_key?: string;
    product_service_id?: string | null;
  };

  if (!body.organisation_id) {
    return NextResponse.json(
      { error: "organisation_id is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const access = await requireOrgAccess(supabase, body.organisation_id);
  if ("error" in access) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status }
    );
  }

  const context = await getBusinessContext(supabase, body.organisation_id);
  if (!context) {
    return NextResponse.json(
      { error: "Organisation not found" },
      { status: 404 }
    );
  }

  const goalKey = mapLegacyObjective(body.goal_key || "engagement");

  const [{ data: latestReview }, { data: org }] = await Promise.all([
    supabase
      .from("marketing_weekly_reviews")
      .select(
        "what_worked, what_didnt, what_to_do_next, recommendations, what_we_learned"
      )
      .eq("organisation_id", body.organisation_id)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("organisations")
      .select("primary_marketing_goal_key")
      .eq("id", body.organisation_id)
      .maybeSingle(),
  ]);

  // Prefer org primary goal when caller didn't specify a stronger one
  const effectiveGoal =
    body.goal_key
      ? goalKey
      : mapLegacyObjective(
          (org?.primary_marketing_goal_key as string) || goalKey
        );

  let learningContext: string | null = null;
  if (latestReview) {
    learningContext = [
      `What worked: ${latestReview.what_worked}`,
      `What didn't: ${latestReview.what_didnt}`,
      `Learned: ${latestReview.what_we_learned}`,
      `Next: ${latestReview.what_to_do_next}`,
      `Recommendations: ${JSON.stringify(latestReview.recommendations || [])}`,
    ].join("\n");
  }

  const result = await generateWeeklyPlan({
    context,
    goalKey: effectiveGoal,
    requestText: body.request_text,
    focusServiceId: body.product_service_id,
    learningContext,
  });

  await recordAiGeneration(supabase, {
    organisationId: body.organisation_id,
    userId: access.user.id,
    generationType: "weekly_plan",
    requestText: body.request_text || null,
    inputContext: {
      goal_key: effectiveGoal,
      used_weekly_review: Boolean(latestReview),
    },
    outputPayload: result.ok ? result.data : null,
    status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
    model: result.ok ? result.model : null,
    errorMessage: result.ok ? null : result.error,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    plan: result.data.plan,
    strategy: result.data.strategy,
    goal_key: effectiveGoal,
    learning_applied: Boolean(latestReview),
    demo: result.demo,
    business_name: context.organisation.name,
  });
}
