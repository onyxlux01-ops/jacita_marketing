/**
 * Delete Jacita system TEST Meta posts + PAUSED test campaign, then soft-clean DB rows.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/cleanup-test-artifacts.mjs
 *   npx tsx --env-file=.env.local scripts/cleanup-test-artifacts.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "crypto";

const ORG_ID = "f0946484-e165-4348-8f81-fa229f992d6b";
const GRAPH =
  process.env.META_GRAPH_API_VERSION ||
  process.env.META_GRAPH_VERSION ||
  "v22.0";
const BASE = `https://graph.facebook.com/${GRAPH}`;
const DRY = process.argv.includes("--dry-run");

function getKey() {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY missing");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* fall through */
  }
  const buf = Buffer.from(raw, "utf8");
  if (buf.length !== 32) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes");
  }
  return buf;
}

function decryptSecret({ ciphertext, iv, authTag }) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function graphDelete(objectId, accessToken) {
  const url = `${BASE}/${objectId}?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: "DELETE" });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.success !== false && !json.error, status: res.status, json };
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function loadPageToken() {
  const { data: accounts, error } = await admin
    .from("social_accounts")
    .select("id, platform, external_account_id, account_name")
    .eq("organisation_id", ORG_ID)
    .in("platform", ["facebook", "instagram"]);
  if (error) throw new Error(error.message);
  const fb =
    (accounts || []).find((a) => a.platform === "facebook") ||
    (accounts || [])[0];
  if (!fb) throw new Error("No Facebook/Instagram social_account for org");

  const { data: secret } = await admin
    .from("social_account_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("social_account_id", fb.id)
    .maybeSingle();
  if (!secret) throw new Error("No token vault for connected account");

  const token = JSON.parse(
    decryptSecret({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.auth_tag,
    })
  );

  const pageToken =
    token.pageAccessToken ||
    token.page_token ||
    token.accessToken ||
    token.access_token;
  const userToken = token.accessToken || token.access_token;
  return { fb, pageToken, userToken, token, accounts };
}

async function main() {
  const report = { dryRun: DRY, deleted: [], db: [], errors: [] };
  const { pageToken, userToken } = await loadPageToken();

  const targets = [
    {
      kind: "facebook_post",
      id: "114767260266469_1711914047603449",
      token: pageToken,
    },
    {
      kind: "instagram_media",
      id: "18048119552806850",
      token: pageToken || userToken,
    },
    {
      kind: "ad_campaign",
      id: "52546046503262",
      token: userToken,
    },
  ];

  for (const t of targets) {
    if (DRY) {
      report.deleted.push({ kind: t.kind, id: t.id, skipped: "dry-run" });
      continue;
    }
    try {
      const result = await graphDelete(t.id, t.token);
      report.deleted.push({
        kind: t.kind,
        id: t.id,
        ok: result.ok,
        status: result.status,
        error: result.json?.error?.message || null,
      });
      if (!result.ok) {
        report.errors.push({
          kind: t.kind,
          id: t.id,
          error: result.json?.error || result.json,
        });
      }
    } catch (e) {
      report.errors.push({
        kind: t.kind,
        id: t.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Mark DB campaign deleted/archived and content as cancelled where possible
  if (!DRY) {
    const { error: campErr } = await admin
      .from("meta_ad_campaigns")
      .update({
        status: "DELETED",
        effective_status: "DELETED",
        updated_at: new Date().toISOString(),
      })
      .eq("external_campaign_id", "52546046503262")
      .eq("organisation_id", ORG_ID);
    report.db.push({ meta_ad_campaigns: campErr ? campErr.message : "updated" });

    const testContentIds = [
      "34e00a37-2e4a-4677-8d99-dd6739cfdaae",
      "0dd8d322-1c1a-452a-99ef-fd7bf8ccfc32",
      "a74da572-516b-436e-96d3-7f1749f04f45",
    ];
    const { error: contentErr } = await admin
      .from("content")
      .update({
        title: "[DELETED TEST] Jacita system test",
        caption: "Test artifact deleted from Meta / archived in Jacita.",
      })
      .in("id", testContentIds)
      .eq("organisation_id", ORG_ID);
    report.db.push({ content: contentErr ? contentErr.message : "labeled deleted" });
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
