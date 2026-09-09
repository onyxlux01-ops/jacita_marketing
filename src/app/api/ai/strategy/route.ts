import { NextResponse } from "next/server";
import {
  generateMarketingStrategy,
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

  const goalKey = mapLegacyObjective(body.goal_key || "awareness");
  const result = await generateMarketingStrategy({
    context,
    goalKey,
    requestText: body.request_text,
    focusServiceId: body.product_service_id,
  });

  await recordAiGeneration(supabase, {
    organisationId: body.organisation_id,
    userId: access.user.id,
    generationType: "strategy",
    requestText: body.request_text || null,
    inputContext: { goal_key: goalKey },
    outputPayload: result.ok ? result.data : null,
    status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
    model: result.ok ? result.model : null,
    errorMessage: result.ok ? null : result.error,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    strategy: result.data,
    goal_key: goalKey,
    demo: result.demo,
    business_name: context.organisation.name,
  });
}
