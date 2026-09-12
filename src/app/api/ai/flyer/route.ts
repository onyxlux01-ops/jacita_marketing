import { NextResponse } from "next/server";
import {
  FLYER_FORMATS,
  FLYER_MEDIA_MODES,
  generateFlyerBrief,
  generateFlyerImage,
  loadFlyerReferenceImages,
  type FlyerFormatId,
  type FlyerMediaMode,
} from "@/lib/ai/flyer";
import {
  getBusinessContext,
  recordAiGeneration,
  requireOrgAccess,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

function userFacingError(error: string) {
  if (/rate|quota|429|credits|billing/i.test(error)) {
    return error;
  }
  if (/network|fetch|timeout/i.test(error)) {
    return "Could not reach OpenAI. Check your connection and try again.";
  }
  return error || "Flyer generation failed. Please try again.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      organisation_id?: string;
      notes?: string | null;
      format?: FlyerFormatId | null;
      product_service_id?: string | null;
      media_mode?: FlyerMediaMode | null;
    };

    if (!body.organisation_id) {
      return NextResponse.json(
        { error: "organisation_id is required" },
        { status: 400 }
      );
    }

    const format =
      FLYER_FORMATS.find((f) => f.id === body.format)?.id ?? "square";
    const mediaMode =
      FLYER_MEDIA_MODES.find((m) => m.id === body.media_mode)?.id ?? "auto";

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

    const briefResult = await generateFlyerBrief({
      context,
      notes: body.notes,
      format,
      productServiceId: body.product_service_id,
      mediaMode,
    });

    if (!briefResult.ok) {
      await recordAiGeneration(supabase, {
        organisationId: body.organisation_id,
        userId: access.user.id,
        generationType: "content",
        requestText: body.notes || null,
        inputContext: {
          mode: "flyer",
          format,
          media_mode: mediaMode,
          stage: "brief",
        },
        status: "failed",
        errorMessage: briefResult.error,
      });
      return NextResponse.json(
        { error: userFacingError(briefResult.error) },
        { status: 502 }
      );
    }

    if (briefResult.demo) {
      await recordAiGeneration(supabase, {
        organisationId: body.organisation_id,
        userId: access.user.id,
        generationType: "content",
        requestText: body.notes || null,
        inputContext: {
          mode: "flyer",
          format,
          media_mode: mediaMode,
          stage: "brief",
          reason: briefResult.reason,
        },
        outputPayload: briefResult.data,
        status: "fallback",
        model: briefResult.model,
        errorMessage: briefResult.detail || null,
      });
      return NextResponse.json(
        {
          error:
            briefResult.detail ||
            "OpenAI is not available for flyer images right now. Check OPENAI_API_KEY and billing.",
          brief: briefResult.data,
          demo: true,
        },
        { status: 502 }
      );
    }

    let referenceBuffers: Buffer[] = [];
    let usedMediaIds: string[] = [];

    const wantRefs =
      mediaMode !== "fresh" &&
      briefResult.data.use_uploaded_media &&
      briefResult.data.reference_media_ids.length > 0;

    if (wantRefs) {
      const loaded = await loadFlyerReferenceImages({
        supabase,
        organisationId: body.organisation_id,
        mediaIds: briefResult.data.reference_media_ids,
        context,
      });
      referenceBuffers = loaded.buffers;
      usedMediaIds = loaded.usedIds;
    }

    const imageResult = await generateFlyerImage({
      brief: briefResult.data,
      format,
      referenceImages: referenceBuffers,
    });

    if (!imageResult.ok) {
      await recordAiGeneration(supabase, {
        organisationId: body.organisation_id,
        userId: access.user.id,
        generationType: "content",
        requestText: body.notes || null,
        inputContext: {
          mode: "flyer",
          format,
          media_mode: mediaMode,
          stage: "image",
          reference_media_ids: usedMediaIds,
        },
        outputPayload: briefResult.data,
        status: "failed",
        model: "gpt-image-2.5-sunburst",
        errorMessage: imageResult.error,
      });
      return NextResponse.json(
        {
          error: userFacingError(imageResult.error),
          brief: briefResult.data,
        },
        { status: 502 }
      );
    }

    const storagePath = `${body.organisation_id}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(storagePath, imageResult.bytes, {
        contentType: imageResult.mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || "Could not save flyer to storage" },
        { status: 502 }
      );
    }

    const description = [
      briefResult.data.headline,
      briefResult.data.subheadline,
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 180);

    const tags = [
      "ai-generated",
      "flyer",
      format,
      ...(usedMediaIds.length ? ["used-library-media"] : []),
    ];

    const { data: asset, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        organisation_id: body.organisation_id,
        storage_path: storagePath,
        file_url: storagePath,
        media_type: "image",
        description: description || "AI flyer",
        category: "Promotion",
        tags,
        width: imageResult.width,
        height: imageResult.height,
        file_size_bytes: imageResult.bytes.byteLength,
        aspect_ratio: `${imageResult.width}:${imageResult.height}`,
        quality_notes: `Generated with ${imageResult.model}${
          usedMediaIds.length
            ? ` · used ${usedMediaIds.length} library photo(s)`
            : ""
        }`,
        uploaded_by: access.user.id,
      })
      .select("id, description, category, media_type, storage_path")
      .single();

    if (insertError || !asset) {
      await supabase.storage.from("media").remove([storagePath]);
      return NextResponse.json(
        { error: insertError?.message || "Could not register flyer asset" },
        { status: 502 }
      );
    }

    const { data: signed } = await supabase.storage
      .from("media")
      .createSignedUrl(storagePath, 60 * 60);

    await recordAiGeneration(supabase, {
      organisationId: body.organisation_id,
      userId: access.user.id,
      generationType: "content",
      requestText: body.notes || null,
      inputContext: {
        mode: "flyer",
        format,
        media_mode: mediaMode,
        product_service_id: body.product_service_id || null,
        reference_media_ids: usedMediaIds,
      },
      outputPayload: {
        brief: briefResult.data,
        media_asset_id: asset.id,
        storage_path: storagePath,
        used_library_media: usedMediaIds,
      },
      status: "success",
      model: imageResult.model,
    });

    return NextResponse.json({
      media: {
        id: asset.id,
        description: asset.description,
        category: asset.category,
        media_type: asset.media_type,
        file_url: signed?.signedUrl ?? null,
        storage_path: asset.storage_path,
      },
      brief: briefResult.data,
      format,
      used_library_media: usedMediaIds,
      demo: false,
      model: imageResult.model,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Flyer generation failed";
    return NextResponse.json(
      { error: userFacingError(message) },
      { status: 500 }
    );
  }
}
