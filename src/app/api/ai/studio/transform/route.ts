import { NextResponse } from "next/server";
import {
  getBusinessContext,
  recordAiGeneration,
  requireOrgAccess,
  rewriteContent,
  generateVariations,
  repurposeContent,
  type RewriteAction,
  REWRITE_ACTIONS,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      organisation_id?: string;
      mode?: "rewrite" | "variations" | "repurpose";
      action?: string;
      platform?: string | null;
      source_platform?: string | null;
      target_platforms?: Array<"instagram" | "facebook" | "tiktok">;
      goal_label?: string | null;
      count?: number;
      content?: {
        title?: string | null;
        hook?: string | null;
        caption?: string | null;
        call_to_action?: string | null;
        hashtags?: string[];
        video_concept?: string | null;
        on_screen_text?: string | null;
        voiceover_script?: string | null;
        alt_text?: string | null;
        content_type?: string | null;
      };
    };

    if (!body.organisation_id || !body.content) {
      return NextResponse.json(
        { error: "organisation_id and content are required" },
        { status: 400 }
      );
    }

    const mode = body.mode || "rewrite";
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

    if (mode === "rewrite") {
      const action = body.action as RewriteAction;
      if (!REWRITE_ACTIONS.includes(action)) {
        return NextResponse.json({ error: "Invalid rewrite action" }, { status: 400 });
      }
      const result = await rewriteContent({
        context,
        content: body.content,
        action,
        platform: body.platform,
        goalLabel: body.goal_label,
      });
      await recordAiGeneration(supabase, {
        organisationId: body.organisation_id,
        userId: access.user.id,
        generationType: "content",
        requestText: action,
        inputContext: { mode: "rewrite", action, platform: body.platform },
        outputPayload: result.ok ? result.data : null,
        status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
        model: result.ok ? result.model : null,
        errorMessage: result.ok ? null : result.error,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: "Could not rewrite content. Please try again." },
          { status: 502 }
        );
      }
      return NextResponse.json({ result: result.data, demo: result.demo });
    }

    if (mode === "variations") {
      const result = await generateVariations({
        context,
        content: body.content,
        platform: body.platform,
        count: body.count ?? 3,
      });
      await recordAiGeneration(supabase, {
        organisationId: body.organisation_id,
        userId: access.user.id,
        generationType: "content",
        requestText: "variations",
        inputContext: { mode: "variations", platform: body.platform },
        outputPayload: result.ok ? result.data : null,
        status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
        model: result.ok ? result.model : null,
        errorMessage: result.ok ? null : result.error,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: "Could not generate variations." },
          { status: 502 }
        );
      }
      return NextResponse.json({ result: result.data, demo: result.demo });
    }

    const targets = (body.target_platforms?.length
      ? body.target_platforms
      : ["instagram", "facebook", "tiktok"]) as Array<
      "instagram" | "facebook" | "tiktok"
    >;
    const result = await repurposeContent({
      context,
      content: body.content,
      sourcePlatform: body.source_platform,
      targetPlatforms: targets,
    });
    await recordAiGeneration(supabase, {
      organisationId: body.organisation_id,
      userId: access.user.id,
      generationType: "content",
      requestText: "repurpose",
      inputContext: {
        mode: "repurpose",
        source_platform: body.source_platform ?? null,
        target_platforms: targets,
      },
      outputPayload: result.ok ? result.data : null,
      status: result.ok ? (result.demo ? "fallback" : "success") : "failed",
      model: result.ok ? result.model : null,
      errorMessage: result.ok ? null : result.error,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Could not repurpose content." },
        { status: 502 }
      );
    }
    return NextResponse.json({ result: result.data, demo: result.demo });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
