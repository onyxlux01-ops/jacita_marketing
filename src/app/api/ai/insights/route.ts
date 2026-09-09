import { NextResponse } from "next/server";
import {
  analysePerformance,
  getBusinessContext,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import {
  buildPerformanceSnapshot,
  type DateRangePreset,
} from "@/lib/analytics";
import { persistPerformanceAnalysis } from "@/lib/analytics/persist";
import type { MarketingGoalKey } from "@/lib/ai/goals";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    organisation_id?: string;
    request_text?: string;
    range?: DateRangePreset;
    start?: string;
    end?: string;
    goal_key?: MarketingGoalKey;
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

  const snapshot = await buildPerformanceSnapshot(
    supabase,
    body.organisation_id,
    {
      preset: body.range || "30d",
      start: body.start,
      end: body.end,
      goalKey: body.goal_key,
    }
  );

  const result = await analysePerformance({
    context,
    snapshot,
    requestText: body.request_text,
  });

  await recordAiGeneration(supabase, {
    organisationId: body.organisation_id,
    userId: access.user.id,
    generationType: "insights",
    requestText: body.request_text || null,
    inputContext: {
      analytics_source: snapshot?.current.source ?? context.analytics.source,
      days: snapshot?.current.days ?? context.analytics.days,
      goal: snapshot?.goalKey ?? null,
      period: snapshot?.range ?? null,
    },
    outputPayload: result.ok ? result.data : null,
    status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
    model: result.ok ? result.model : null,
    errorMessage: result.ok ? null : result.error,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  if (snapshot) {
    await persistPerformanceAnalysis({
      supabase,
      organisationId: body.organisation_id,
      userId: access.user.id,
      snapshot,
      insights: result.data,
      model: result.ok ? result.model : null,
    });
  }

  return NextResponse.json({
    result: result.data,
    snapshot: snapshot
      ? {
          health: snapshot.health,
          range: snapshot.range,
          goal: snapshot.goalLabel,
          data_quality: snapshot.dataQuality,
          platforms: snapshot.platforms.map((p) => ({
            platform: p.platform,
            reach: p.totals.reach,
            engagement_rate: p.totals.engagement_rate,
            net_followers: p.totals.net_followers,
            top_content: p.topContentTitle,
          })),
          rankings: snapshot.rankings,
        }
      : null,
    demo: result.demo,
    business_name: context.organisation.name,
  });
}
