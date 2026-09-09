import { NextResponse } from "next/server";
import {
  generateContentPackage,
  getBusinessContext,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

function userFacingError(error: string) {
  if (/rate|quota|429/i.test(error)) {
    return "The AI service is busy. Please try again in a moment.";
  }
  if (/network|fetch|timeout/i.test(error)) {
    return "Could not reach the AI service. Check your connection and try again.";
  }
  return "Content generation failed. Please try again.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      organisation_id?: string;
      product_service_id?: string | null;
      campaign_id?: string | null;
      platform?: string | null;
      platforms?: string[] | null;
      content_type?: string | null;
      marketing_objective?: string | null;
      tone?: string | null;
      media_asset_id?: string | null;
      notes?: string;
      let_ai_decide_platform?: boolean;
      let_ai_decide_content_type?: boolean;
      let_ai_decide_media?: boolean;
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

    const context = await getBusinessContext(supabase, body.organisation_id, {
      userId: access.user.id,
    });
    if (!context) {
      return NextResponse.json(
        { error: "Business not found or access denied" },
        { status: 404 }
      );
    }

    if (context.gaps.includes("business description") && context.gaps.includes("brand voice")) {
      // soft warning only — still generate
    }

    const result = await generateContentPackage({
      context,
      notes: body.notes,
      goalKey: body.marketing_objective,
      productServiceId: body.product_service_id,
      campaignId: body.campaign_id,
      platform: body.platform,
      platforms: body.platforms,
      contentType: body.content_type,
      tone: body.tone,
      mediaAssetId: body.media_asset_id,
      letAiDecidePlatform: body.let_ai_decide_platform,
      letAiDecideContentType: body.let_ai_decide_content_type,
      letAiDecideMedia: body.let_ai_decide_media,
    });

    await recordAiGeneration(supabase, {
      organisationId: body.organisation_id,
      userId: access.user.id,
      generationType: "content",
      requestText: body.notes || null,
      inputContext: {
        mode: "content_package",
        platform: body.platform,
        content_type: body.content_type,
        marketing_objective: body.marketing_objective,
        product_service_id: body.product_service_id,
        let_ai_decide_platform: body.let_ai_decide_platform,
        let_ai_decide_content_type: body.let_ai_decide_content_type,
        let_ai_decide_media: body.let_ai_decide_media,
      },
      outputPayload: result.ok ? result.data : null,
      status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
      model: result.ok ? result.model : null,
      errorMessage: result.ok ? null : result.error,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: userFacingError(result.error) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      package: result.data.package,
      brief: result.data.brief,
      validation: result.data.validation,
      media: result.data.mediaRecommendation,
      selected_media_id: result.data.selectedMediaId,
      goal_key: result.data.goalKey,
      content_type: result.data.contentType,
      tone: result.data.tone,
      service_id: result.data.serviceId,
      demo: result.demo,
      business_name: context.organisation.name,
      gaps: context.gaps,
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong while generating content." },
      { status: 500 }
    );
  }
}
