import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/social/crypto";
import type { TokenBundle } from "@/lib/social/types";

export async function saveAccountSecrets(input: {
  socialAccountId: string;
  organisationId: string;
  token: TokenBundle;
}) {
  const admin = createAdminClient();
  const payload = JSON.stringify(input.token);
  const encrypted = encryptSecret(payload);

  const { error } = await admin.from("social_account_secrets").upsert({
    social_account_id: input.socialAccountId,
    organisation_id: input.organisationId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    key_version: 1,
  });

  if (error) throw new Error(`Failed to store token vault: ${error.message}`);

  await admin
    .from("social_accounts")
    .update({ token_vault_ref: input.socialAccountId })
    .eq("id", input.socialAccountId)
    .eq("organisation_id", input.organisationId);
}

export async function loadAccountSecrets(
  socialAccountId: string,
  organisationId: string
): Promise<TokenBundle | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("social_account_secrets")
    .select("ciphertext, iv, auth_tag, organisation_id")
    .eq("social_account_id", socialAccountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.organisation_id !== organisationId) {
    throw new Error("Token organisation mismatch");
  }

  const plaintext = decryptSecret({
    ciphertext: data.ciphertext,
    iv: data.iv,
    authTag: data.auth_tag,
  });
  return JSON.parse(plaintext) as TokenBundle;
}

export async function deleteAccountSecrets(
  socialAccountId: string,
  organisationId: string
) {
  const admin = createAdminClient();
  await admin
    .from("social_account_secrets")
    .delete()
    .eq("social_account_id", socialAccountId)
    .eq("organisation_id", organisationId);
}
