import { NextResponse } from "next/server";
import {
  getBusinessContext,
  interpretAssistantRequest,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    organisation_id?: string;
    request_text?: string;
    preset_intent?: string | null;
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

  const requestText = (body.request_text || "").trim();
  if (!requestText && !body.preset_intent) {
    return NextResponse.json(
      { error: "Tell Jacita what you want to achieve" },
      { status: 400 }
    );
  }

  const result = await interpretAssistantRequest({
    context,
    requestText: requestText || body.preset_intent || "",
    presetIntent: body.preset_intent,
  });

  await recordAiGeneration(supabase, {
    organisationId: body.organisation_id,
    userId: access.user.id,
    generationType: "assistant",
    requestText: requestText || body.preset_intent || null,
    inputContext: {
      organisation_id: body.organisation_id,
      preset_intent: body.preset_intent || null,
      gaps: context.gaps,
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
    result: result.data,
    demo: result.demo,
    business: {
      id: context.organisation.id,
      name: context.organisation.name,
      gaps: context.gaps,
    },
  });
}
