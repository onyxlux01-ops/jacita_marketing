"use client";

import { createClient } from "@/lib/supabase/client";

/** Matches the Supabase `media` bucket allowlist (50 MiB). */
export const MEDIA_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export const MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm";

export function mediaTypeFromFile(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

export function validateMediaFile(file: File): string | null {
  if (!file.size) return "Empty file";
  if (file.size > MEDIA_MAX_BYTES) {
    return `${file.name} is larger than 50 MB`;
  }
  if (file.type && !MEDIA_ALLOWED_TYPES.has(file.type)) {
    return `${file.name}: use JPEG, PNG, WebP, GIF, MP4, MOV, or WebM (HEIC/AVIF not supported)`;
  }
  // Some browsers leave type blank for .mov — allow by extension
  if (!file.type) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const ok = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm"];
    if (!ext || !ok.includes(ext)) {
      return `${file.name}: unsupported file type`;
    }
  }
  return null;
}

export type UploadedMediaFile = {
  storagePath: string;
  mediaType: "image" | "video";
  contentType: string;
  fileName: string;
};

/**
 * Upload files straight to Supabase Storage (bypasses Next server-action body limits).
 */
export async function uploadFilesToMediaBucket(
  organisationId: string,
  files: File[]
): Promise<{ uploads: UploadedMediaFile[]; error?: string }> {
  const supabase = createClient();
  const uploads: UploadedMediaFile[] = [];

  for (const file of files) {
    const invalid = validateMediaFile(file);
    if (invalid) {
      // Clean up any prior uploads in this batch
      if (uploads.length) {
        await supabase.storage
          .from("media")
          .remove(uploads.map((u) => u.storagePath));
      }
      return { uploads: [], error: invalid };
    }

    const ext =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
      "bin";
    const storagePath = `${organisationId}/${crypto.randomUUID()}.${ext}`;
    const contentType =
      file.type ||
      (ext === "mov"
        ? "video/quicktime"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : `application/octet-stream`);

    const { error } = await supabase.storage
      .from("media")
      .upload(storagePath, file, { contentType, upsert: false });

    if (error) {
      if (uploads.length) {
        await supabase.storage
          .from("media")
          .remove(uploads.map((u) => u.storagePath));
      }
      return {
        uploads: [],
        error: error.message || "Storage upload failed",
      };
    }

    uploads.push({
      storagePath,
      mediaType: mediaTypeFromFile(file),
      contentType,
      fileName: file.name,
    });
  }

  return { uploads };
}
