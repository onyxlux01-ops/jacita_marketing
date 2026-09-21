import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/social/crypto";
import { getMetaAppCredentials } from "@/lib/social/meta-client";

export type MetaAppCredentials = {
  appId: string;
  appSecret: string;
};

export type ResolvedMetaAppCredentials = MetaAppCredentials & {
  /** "org" = per-business override, "env" = shared global app. */
  source: "org" | "env";
};

/**
 * The generated Database types don't yet include organisation_meta_apps, so we
 * talk to it through an untyped view of the (already service-role) admin client.
 * All access here is server-only and scoped by organisation_id.
 */
function metaAppsTable() {
  const admin = createAdminClient() as unknown as SupabaseClient;
  return admin.from("organisation_meta_apps");
}

type OrgMetaAppRow = {
  organisation_id: string;
  app_id: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  label: string | null;
};

/**
 * Resolve the Meta app credentials to use for a given organisation.
 * Prefers the per-business override; falls back to the shared global app so
 * existing businesses (and the platform default) keep working unchanged.
 */
export async function getMetaAppCredentialsForOrg(
  organisationId: string
): Promise<ResolvedMetaAppCredentials | null> {
  const { data, error } = await metaAppsTable()
    .select("app_id, ciphertext, iv, auth_tag")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (!error && data) {
    const row = data as Pick<
      OrgMetaAppRow,
      "app_id" | "ciphertext" | "iv" | "auth_tag"
    >;
    try {
      const appSecret = decryptSecret({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
      return { appId: row.app_id, appSecret, source: "org" };
    } catch {
      // Corrupt/undecryptable override — fall through to the shared app.
    }
  }

  const env = getMetaAppCredentials();
  if (env) return { ...env, source: "env" };
  return null;
}

/**
 * Non-secret view of an org's Meta app config, for rendering settings UI.
 */
export async function getOrgMetaAppInfo(organisationId: string): Promise<{
  hasOverride: boolean;
  appId: string | null;
  label: string | null;
}> {
  const { data, error } = await metaAppsTable()
    .select("app_id, label")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (error || !data) {
    return { hasOverride: false, appId: null, label: null };
  }
  const row = data as Pick<OrgMetaAppRow, "app_id" | "label">;
  return { hasOverride: true, appId: row.app_id, label: row.label ?? null };
}

/**
 * Store (or replace) a per-business Meta app override. The secret is encrypted
 * with SOCIAL_TOKEN_ENCRYPTION_KEY before it ever hits the database.
 */
export async function saveOrgMetaApp(input: {
  organisationId: string;
  appId: string;
  appSecret: string;
  label?: string | null;
}): Promise<void> {
  const encrypted = encryptSecret(input.appSecret);
  const { error } = await metaAppsTable().upsert({
    organisation_id: input.organisationId,
    app_id: input.appId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    key_version: 1,
    label: input.label ?? null,
  });
  if (error) {
    throw new Error(`Failed to save Meta app credentials: ${error.message}`);
  }
}

export async function deleteOrgMetaApp(organisationId: string): Promise<void> {
  const { error } = await metaAppsTable()
    .delete()
    .eq("organisation_id", organisationId);
  if (error) {
    throw new Error(`Failed to remove Meta app credentials: ${error.message}`);
  }
}
