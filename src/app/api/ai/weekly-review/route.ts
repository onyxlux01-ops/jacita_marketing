import { NextResponse } from "next/server";
import {
  generateWeeklyReview,
  getBusinessContext,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import { buildPerformanceSnapshot, weekRangeEnding } from "@/lib/analytics";
import { persistWeeklyReview } from "@/lib/analytics/persist";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    organisation_id?: string;
    request_text?: string;
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

  const week = weekRangeEnding();
  const snapshot = await buildPerformanceSnapshot(
    supabase,
    body.organisation_id,
    { preset: "custom", start: week.start, end: week.end }
  );

  const result = await generateWeeklyReview({
    context,
    snapshot,
    requestText: body.request_text,
  });

  await recordAiGeneration(supabase, {
    organisationId: body.organisation_id,
    userId: access.user.id,
    generationType: "insights",
    requestText: body.request_text || "weekly_review",
    inputContext: {
      run: "weekly_review",
      period: week,
      goal: snapshot?.goalKey ?? null,
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
    await persistWeeklyReview({
      supabase,
      organisationId: body.organisation_id,
      userId: access.user.id,
      snapshot,
      review: result.data,
      model: result.model,
    });
  }

  return NextResponse.json({
    result: result.data,
    week,
    health: snapshot?.health ?? null,
    demo: result.demo,
    business_name: context.organisation.name,
  });
}
