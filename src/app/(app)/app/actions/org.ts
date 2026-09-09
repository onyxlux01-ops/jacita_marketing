"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setActiveOrganisationCookie } from "@/lib/org";
import type { Database, Json, SocialPlatform } from "@/lib/database.types";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { ContentStatus } from "@/lib/types";

type AuditInput = {
  organisationId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Json;
};

async function getAuthedClient() {
  if (!hasSupabaseEnv()) {
    return { error: "Supabase is not configured" as const };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

async function assertOrgMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string
) {
  const { data } = await supabase
    .from("organisation_members")
    .select("id, role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: AuditInput
) {
  await supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function switchOrganisation(organisationId: string) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "You are not a member of that business" };

  await setActiveOrganisationCookie(organisationId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateContentStatus(
  contentId: string,
  status: ContentStatus,
  scheduledAt?: string | null
) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const { data: existing } = await auth.supabase
    .from("content")
    .select("id, organisation_id, suggested_posting_time, scheduled_at")
    .eq("id", contentId)
    .maybeSingle();

  if (!existing) return { error: "Content not found" };

  // Publishing is handled by the social publishing engine — do not fake-publish
  if (status === "published" || status === "publishing") {
    return {
      error:
        "Use Schedule or Publish now so posts go through the connected social accounts.",
    };
  }

  const updates: Database["public"]["Tables"]["content"]["Update"] = {
    status,
  };

  if (status === "scheduled") {
    const when =
      scheduledAt ||
      existing.scheduled_at ||
      existing.suggested_posting_time ||
      new Date(Date.now() + 60 * 60 * 1000).toISOString();
    updates.scheduled_at = when;

    const { scheduleContentPublishing } = await import(
      "@/app/(app)/app/actions/social"
    );
    const scheduled = await scheduleContentPublishing({
      contentId,
      organisationId: existing.organisation_id,
      scheduledAt: when,
    });
    if (scheduled.error) return { error: scheduled.error };
    return { success: true };
  }

  const { error } = await auth.supabase
    .from("content")
    .update(updates)
    .eq("id", contentId);

  if (error) return { error: error.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId: existing.organisation_id,
    action: `content.${status}`,
    entityType: "content",
    entityId: contentId,
  });

  revalidatePath("/app/content");
  revalidatePath(`/app/content/${contentId}`);
  revalidatePath("/app");
  revalidatePath("/app/calendar");
  return { success: true };
}

export async function createService(formData: FormData) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!organisationId || !name) {
    return { error: "Name is required" };
  }

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const { data, error } = await auth.supabase
    .from("products_services")
    .insert({
      organisation_id: organisationId,
      name,
      description: String(formData.get("description") ?? "") || null,
      category: String(formData.get("category") ?? "") || null,
      price: formData.get("price") ? Number(formData.get("price")) : null,
      duration_minutes: formData.get("duration_minutes")
        ? Number(formData.get("duration_minutes"))
        : null,
      target_audience: String(formData.get("target_audience") ?? "") || null,
      is_featured: formData.get("is_featured") === "on",
      is_promotion: formData.get("is_promotion") === "on",
      is_active: formData.get("is_active") === "on",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId,
    action: "service.created",
    entityType: "products_services",
    entityId: data.id,
  });

  revalidatePath("/app/services");
  return { success: true };
}

export async function updateService(formData: FormData) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const serviceId = String(formData.get("service_id") ?? "");
  const organisationId = String(formData.get("organisation_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!serviceId || !organisationId || !name) {
    return { error: "Service id and name are required" };
  }

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const { error } = await auth.supabase
    .from("products_services")
    .update({
      name,
      description: String(formData.get("description") ?? "") || null,
      category: String(formData.get("category") ?? "") || null,
      price: formData.get("price") ? Number(formData.get("price")) : null,
      duration_minutes: formData.get("duration_minutes")
        ? Number(formData.get("duration_minutes"))
        : null,
      target_audience: String(formData.get("target_audience") ?? "") || null,
      is_featured: formData.get("is_featured") === "on",
      is_promotion: formData.get("is_promotion") === "on",
      is_active: formData.get("is_active") === "on",
    })
    .eq("id", serviceId)
    .eq("organisation_id", organisationId);

  if (error) return { error: error.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId,
    action: "service.updated",
    entityType: "products_services",
    entityId: serviceId,
  });

  revalidatePath("/app/services");
  return { success: true };
}

export async function deleteService(serviceId: string, organisationId?: string) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const { data: existing } = await auth.supabase
    .from("products_services")
    .select("id, organisation_id")
    .eq("id", serviceId)
    .maybeSingle();

  if (!existing) return { error: "Service not found" };
  if (organisationId && existing.organisation_id !== organisationId) {
    return { error: "Unauthorized" };
  }

  const { error } = await auth.supabase
    .from("products_services")
    .delete()
    .eq("id", serviceId);

  if (error) return { error: error.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId: existing.organisation_id,
    action: "service.deleted",
    entityType: "products_services",
    entityId: serviceId,
  });

  revalidatePath("/app/services");
  return { success: true };
}

export async function updateOrganisationSettings(formData: FormData) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  if (!organisationId) return { error: "Missing organisation" };

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const openingHoursRaw = String(formData.get("opening_hours") ?? "").trim();
  let openingHours: Json | null = null;
  if (openingHoursRaw) {
    try {
      openingHours = JSON.parse(openingHoursRaw) as Json;
    } catch {
      openingHours = { text: openingHoursRaw };
    }
  }

  const { error: orgError } = await auth.supabase
    .from("organisations")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      business_category: String(formData.get("business_category") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      location: String(formData.get("location") ?? "") || null,
      website: String(formData.get("website") ?? "") || null,
      booking_url: String(formData.get("booking_url") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      opening_hours: openingHours,
    })
    .eq("id", organisationId);

  if (orgError) return { error: orgError.message };

  const logo = formData.get("logo") as File | null;
  let logoPath: string | null | undefined;
  if (logo && logo.size > 0) {
    const ext = logo.name.split(".").pop() || "png";
    const path = `${organisationId}/logo-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await auth.supabase.storage
      .from("brand")
      .upload(path, logo, { contentType: logo.type, upsert: true });
    if (uploadError) return { error: uploadError.message };
    logoPath = path;
    await auth.supabase
      .from("organisations")
      .update({ logo_path: path })
      .eq("id", organisationId);
  }

  const brandUpdate: Database["public"]["Tables"]["brand_profiles"]["Update"] =
    {
      brand_voice: String(formData.get("brand_voice") ?? "") || null,
      tone: String(formData.get("tone") ?? "") || null,
      target_audience: String(formData.get("target_audience") ?? "") || null,
      business_description:
        String(formData.get("business_description") ?? "") || null,
      marketing_objectives:
        String(formData.get("marketing_objectives") ?? "") || null,
      preferred_terminology:
        String(formData.get("preferred_terminology") ?? "") || null,
      words_to_avoid: String(formData.get("words_to_avoid") ?? "") || null,
      custom_instructions:
        String(formData.get("custom_instructions") ?? "") || null,
      primary_color: String(formData.get("primary_color") ?? "") || null,
      secondary_color: String(formData.get("secondary_color") ?? "") || null,
    };
  if (logoPath) brandUpdate.logo_path = logoPath;

  const { data: existingBrand } = await auth.supabase
    .from("brand_profiles")
    .select("id")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const { error: brandError } = existingBrand
    ? await auth.supabase
        .from("brand_profiles")
        .update(brandUpdate)
        .eq("organisation_id", organisationId)
    : await auth.supabase.from("brand_profiles").insert({
        organisation_id: organisationId,
        ...brandUpdate,
      });

  if (brandError) return { error: brandError.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId,
    action: "settings.updated",
    entityType: "organisations",
    entityId: organisationId,
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { success: true };
}

export async function createCampaign(formData: FormData) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!organisationId || !name) return { error: "Name is required" };

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const { data, error } = await auth.supabase
    .from("campaigns")
    .insert({
      organisation_id: organisationId,
      name,
      objective: String(formData.get("objective") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      target_audience: String(formData.get("target_audience") ?? "") || null,
      budget: formData.get("budget") ? Number(formData.get("budget")) : null,
      start_date: String(formData.get("start_date") ?? "") || null,
      end_date: String(formData.get("end_date") ?? "") || null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId,
    action: "campaign.created",
    entityType: "campaigns",
    entityId: data.id,
  });

  revalidatePath("/app/campaigns");
  return { success: true };
}

export async function saveGeneratedContent(payload: {
  organisation_id: string;
  campaign_id?: string | null;
  product_service_id?: string | null;
  media_asset_id?: string | null;
  title?: string | null;
  idea?: string | null;
  hook?: string | null;
  caption?: string | null;
  call_to_action?: string | null;
  hashtags?: string[];
  suggested_posting_time?: string | null;
  video_concept?: string | null;
  content_type?: string | null;
  marketing_objective?: string | null;
  tone?: string | null;
  platforms?: SocialPlatform[];
  generation_payload?: Json;
  status?: ContentStatus;
  scheduled_at?: string | null;
}) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    payload.organisation_id
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const status = payload.status ?? "draft";
  let scheduledAt = payload.scheduled_at ?? null;
  if (status === "scheduled" && !scheduledAt) {
    scheduledAt =
      payload.suggested_posting_time ||
      new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const { data, error } = await auth.supabase
    .from("content")
    .insert({
      organisation_id: payload.organisation_id,
      campaign_id: payload.campaign_id || null,
      product_service_id: payload.product_service_id || null,
      media_asset_id: payload.media_asset_id || null,
      title: payload.title || null,
      idea: payload.idea || null,
      hook: payload.hook || null,
      caption: payload.caption || null,
      call_to_action: payload.call_to_action || null,
      hashtags: payload.hashtags ?? [],
      suggested_posting_time: payload.suggested_posting_time || null,
      video_concept: payload.video_concept || null,
      content_type: payload.content_type || null,
      marketing_objective: payload.marketing_objective || null,
      tone: payload.tone || null,
      status,
      scheduled_at: scheduledAt,
      published_at: status === "published" ? new Date().toISOString() : null,
      generation_payload: payload.generation_payload ?? null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (data?.id && payload.platforms?.length) {
    await auth.supabase.from("content_platforms").insert(
      payload.platforms.map((platform) => ({
        content_id: data.id,
        platform,
      }))
    );
  }

  if (data?.id && payload.hashtags?.length) {
    await auth.supabase.from("content_tags").insert(
      payload.hashtags
        .map((tag) => tag.replace(/^#/, "").trim())
        .filter(Boolean)
        .map((tag) => ({
          content_id: data.id,
          tag,
        }))
    );
  }

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId: payload.organisation_id,
    action: "content.created",
    entityType: "content",
    entityId: data.id,
    metadata: { status },
  });

  revalidatePath("/app/content");
  revalidatePath("/app");
  revalidatePath("/app/calendar");
  return { id: data.id };
}

export async function uploadMediaAsset(formData: FormData) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!organisationId || files.length === 0) {
    return { error: "Organisation and at least one file are required" };
  }

  const membership = await assertOrgMember(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const category = String(formData.get("category") ?? "") || null;
  const description = String(formData.get("description") ?? "") || null;
  const uploadedIds: string[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${organisationId}/${crypto.randomUUID()}.${ext}`;
    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    const { error: uploadError } = await auth.supabase.storage
      .from("media")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) return { error: uploadError.message };

    const { data, error } = await auth.supabase
      .from("media_assets")
      .insert({
        organisation_id: organisationId,
        storage_path: storagePath,
        file_url: storagePath,
        media_type: mediaType,
        description,
        category,
        uploaded_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    uploadedIds.push(data.id);

    await writeAudit(auth.supabase, auth.user.id, {
      organisationId,
      action: "media.uploaded",
      entityType: "media_assets",
      entityId: data.id,
    });
  }

  revalidatePath("/app/media");
  revalidatePath("/app/content/new");
  revalidatePath("/app/onboarding/setup");
  return { success: true, count: uploadedIds.length };
}

export async function toggleMediaFavourite(mediaId: string) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const { data: existing } = await auth.supabase
    .from("media_assets")
    .select("id, organisation_id, is_favourite")
    .eq("id", mediaId)
    .maybeSingle();

  if (!existing) return { error: "Media not found" };

  const { error } = await auth.supabase
    .from("media_assets")
    .update({ is_favourite: !existing.is_favourite })
    .eq("id", mediaId);

  if (error) return { error: error.message };

  revalidatePath("/app/media");
  return { success: true, is_favourite: !existing.is_favourite };
}

export async function deleteMediaAsset(mediaId: string) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const { data: existing } = await auth.supabase
    .from("media_assets")
    .select("id, organisation_id, storage_path")
    .eq("id", mediaId)
    .maybeSingle();

  if (!existing) return { error: "Media not found" };

  const { error: softError } = await auth.supabase
    .from("media_assets")
    .update({ is_active: false })
    .eq("id", mediaId);

  if (softError) return { error: softError.message };

  // Storage delete requires manager+; soft-delete still hides the asset for everyone.
  await auth.supabase.storage.from("media").remove([existing.storage_path]);

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId: existing.organisation_id,
    action: "media.deleted",
    entityType: "media_assets",
    entityId: mediaId,
  });

  revalidatePath("/app/media");
  return { success: true };
}

export async function toggleOrganisationDisabled(
  organisationId: string,
  disabled: boolean
) {
  const auth = await getAuthedClient();
  if ("error" in auth) return { error: auth.error };

  const { data: profile } = await auth.supabase
    .from("users")
    .select("is_platform_admin")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) {
    return { error: "Unauthorized" };
  }

  const { error } = await auth.supabase
    .from("organisations")
    .update({ status: disabled ? "disabled" : "active" })
    .eq("id", organisationId);

  if (error) return { error: error.message };

  await writeAudit(auth.supabase, auth.user.id, {
    organisationId,
    action: disabled ? "organisation.disabled" : "organisation.enabled",
    entityType: "organisations",
    entityId: organisationId,
  });

  revalidatePath("/platform");
  return { success: true };
}
