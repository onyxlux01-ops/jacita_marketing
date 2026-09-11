import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Create a time-limited signed URL for platform pull-from-URL publishing.
 * Media stays in private org folders; URLs are not permanent public ACLs.
 */
export async function getPublishableMediaUrl(input: {
  organisationId: string;
  storagePath: string;
  expiresInSeconds?: number;
}) {
  // Path must start with organisation id folder
  if (!input.storagePath.startsWith(`${input.organisationId}/`)) {
    throw new Error("Media path is not scoped to this organisation");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("media")
    .createSignedUrl(
      input.storagePath,
      input.expiresInSeconds ?? 60 * 60 * 6
    );

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not create media URL");
  }

  return data.signedUrl;
}

export async function resolveContentMediaForPublish(input: {
  organisationId: string;
  mediaAssetId: string | null;
}) {
  if (!input.mediaAssetId) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("media_assets")
    .select("id, organisation_id, storage_path, media_type, description")
    .eq("id", input.mediaAssetId)
    .eq("organisation_id", input.organisationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return [];

  const publicUrl = await getPublishableMediaUrl({
    organisationId: input.organisationId,
    storagePath: data.storage_path,
  });

  return [
    {
      mediaType: data.media_type as "image" | "video",
      publicUrl,
      fileName: data.storage_path.split("/").pop() || null,
    },
  ];
}
