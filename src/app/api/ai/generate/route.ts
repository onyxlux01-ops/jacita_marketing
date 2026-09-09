import { NextResponse } from "next/server";
import {
  generateContent,
  getBusinessContext,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    organisation_id?: string;
    product_service_id?: string | null;
    platform?: string;
    content_type?: string;
    marketing_objective?: string;
    tone?: string;
    is_promotion?: boolean;
    media_asset_id?: string | null;
    notes?: string;
    strategy_summary?: string | null;
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

  const result = await generateContent({
    context,
    platform: body.platform || "instagram",
    contentType: body.content_type || "image_post",
    goalKey: body.marketing_objective,
    tone: body.tone,
    isPromotion: body.is_promotion,
    productServiceId: body.product_service_id,
    mediaAssetId: body.media_asset_id,
    notes: body.notes,
    strategySummary: body.strategy_summary,
  });

  await recordAiGeneration(supabase, {
    organisationId: body.organisation_id,
    userId: access.user.id,
    generationType: "content",
    requestText: body.notes || null,
    inputContext: {
      platform: body.platform,
      content_type: body.content_type,
      marketing_objective: body.marketing_objective,
      product_service_id: body.product_service_id,
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
    result: result.data.content,
    validation: result.data.validation,
    media: result.data.mediaRecommendation,
    selected_media_id: result.data.selectedMediaId,
    goal_key: result.data.goalKey,
    demo: result.demo,
    business_name: context.organisation.name,
  });
}
