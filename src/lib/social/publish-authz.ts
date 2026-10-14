import type { createAdminClient } from "@/lib/supabase/admin";
import type { SocialPlatform } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Publishing authorisation shared by every enqueue / publish / retry path.
 *
 * All of these paths use the service-role client, so RLS does not protect
 * them; these checks must run before any privileged write or provider call.
 */

/** Roles allowed to queue, publish, retry or override publishing. */
export const PUBLISHER_ROLES = ["owner", "manager"] as const;
export type PublisherRole = (typeof PUBLISHER_ROLES)[number];

/**
 * Content states from which an authorised user may queue or manually publish.
 * `failed` content was necessarily approved + scheduled before (only the
 * publisher sets it, and staff cannot write it), so retrying it is allowed.
 * Draft / review content must be approved first — this is what makes
 * approval-required mode hold for everyone.
 */
export const ENQUEUE_CONTENT_STATUSES = ["approved", "scheduled", "failed"];

/** Content states in which an already-queued job may still execute. */
export const EXECUTE_CONTENT_STATUSES = [
  "approved",
  "scheduled",
  "publishing",
  "failed",
];

export async function getPublisherRole(
  admin: Admin,
  organisationId: string,
  userId: string | null | undefined
): Promise<PublisherRole | null> {
  if (!userId) return null;
  const { data, error } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Membership lookup failed: ${error.message}`);
  const role = data?.role;
  return role === "owner" || role === "manager" ? role : null;
}

export function contentStatusAllows(
  status: string | null | undefined,
  phase: "enqueue" | "execute"
) {
  const allowed =
    phase === "enqueue" ? ENQUEUE_CONTENT_STATUSES : EXECUTE_CONTENT_STATUSES;
  return Boolean(status && allowed.includes(status));
}

export type ResolvedContentPlatform = {
  id: string;
  external_post_id: string | null;
  publish_status: string;
};

/**
 * Derive the content_platforms row on the server from (content, platform)
 * and reject any caller-supplied id that does not match it. Must run before
 * duplicate checks, so a foreign row id can never leak its external post id
 * or be overwritten.
 */
export async function resolveContentPlatform(
  admin: Admin,
  input: {
    contentId: string;
    platform: SocialPlatform | string;
    suppliedId?: string | null;
  }
): Promise<
  { ok: true; row: ResolvedContentPlatform } | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from("content_platforms")
    .select("id, external_post_id, publish_status")
    .eq("content_id", input.contentId)
    .eq("platform", input.platform as SocialPlatform)
    .maybeSingle();
  if (error) return { ok: false, error: `Platform lookup failed: ${error.message}` };
  if (!data) {
    return {
      ok: false,
      error: `This content does not target ${input.platform}. Add the platform before publishing.`,
    };
  }
  if (input.suppliedId && input.suppliedId !== data.id) {
    return {
      ok: false,
      error: "The platform row does not belong to this content and account.",
    };
  }
  return { ok: true, row: data as ResolvedContentPlatform };
}
