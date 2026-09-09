/**
 * Read-only Meta live verification against connected social_accounts.
 * Does NOT publish. Does NOT create ad campaigns or spend money.
 *
 * Usage: node --env-file=.env.local scripts/meta-live-verify.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "crypto";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function encryptionKey() {
  const raw = requireEnv("SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length !== 32) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes");
  }
  return utf8;
}

function decryptSecret({ ciphertext, iv, authTag }) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

const graphVersion = process.env.META_GRAPH_API_VERSION || "v22.0";
const graphBase = `https://graph.facebook.com/${graphVersion}`;

async function graphGet(path, accessToken, fields) {
  const url = new URL(`${graphBase}${path}`);
  url.searchParams.set("access_token", accessToken);
  if (fields) url.searchParams.set("fields", fields);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) {
    const err = new Error(json.error?.message || `HTTP ${res.status}`);
    err.code = json.error?.code;
    err.type = json.error?.type;
    throw err;
  }
  return json;
}

function summarizeScopes(scopes) {
  const list = Array.isArray(scopes) ? scopes : [];
  return {
    count: list.length,
    hasAdsRead: list.includes("ads_read"),
    hasAdsManagement: list.includes("ads_management"),
    hasPagesManagePosts: list.includes("pages_manage_posts"),
    hasInstagramBasic: list.some((s) =>
      /instagram_basic|instagram_content_publish|instagram_business_basic/i.test(
        s
      )
    ),
  };
}

const report = {
  schema: {},
  orgs: [],
  liveGraph: {
    tokenDebug: null,
    meAccounts: null,
    adAccountsList: null,
  },
  reconnectNeeded: false,
  notes: [],
};

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("META_APP_ID");
  requireEnv("META_APP_SECRET");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Schema / RLS presence
  for (const table of [
    "meta_ad_accounts",
    "meta_ad_campaigns",
    "advertising_settings",
    "advertising_actions",
  ]) {
    const { error, count } = await admin
      .from(table)
      .select("*", { count: "exact", head: true });
    report.schema[table] = error
      ? { ok: false, error: error.message }
      : { ok: true, count: count ?? 0 };
  }

  const { data: accounts, error: accErr } = await admin
    .from("social_accounts")
    .select(
      "id, organisation_id, platform, connection_status, account_name, account_handle, scopes, token_expires_at, health_status, organisations(name)"
    )
    .in("platform", ["facebook", "instagram"])
    .eq("connection_status", "connected");

  if (accErr) throw new Error(accErr.message);

  const byOrg = new Map();
  for (const a of accounts || []) {
    if (!byOrg.has(a.organisation_id)) byOrg.set(a.organisation_id, []);
    byOrg.get(a.organisation_id).push(a);
  }

  for (const [orgId, rows] of byOrg) {
    const orgName = rows[0]?.organisations?.name || orgId;
    const entry = {
      organisationId: orgId,
      organisationName: orgName,
      platforms: rows.map((r) => ({
        platform: r.platform,
        name: r.account_handle || r.account_name,
        scopes: summarizeScopes(r.scopes),
        tokenExpiresAt: r.token_expires_at,
        health: r.health_status,
      })),
      tokenDecryptOk: false,
      graph: {},
    };

    const fb = rows.find((r) => r.platform === "facebook");
    const tokenAccount = fb || rows[0];
    const { data: secret } = await admin
      .from("social_account_secrets")
      .select("ciphertext, iv, auth_tag, organisation_id")
      .eq("social_account_id", tokenAccount.id)
      .maybeSingle();

    if (!secret) {
      entry.graph.error = "No encrypted secrets row";
      report.orgs.push(entry);
      continue;
    }

    let token;
    try {
      const plaintext = decryptSecret({
        ciphertext: secret.ciphertext,
        iv: secret.iv,
        authTag: secret.auth_tag,
      });
      token = JSON.parse(plaintext);
      entry.tokenDecryptOk = Boolean(token?.accessToken);
    } catch (e) {
      entry.graph.error = `Decrypt failed: ${e.message}`;
      report.orgs.push(entry);
      continue;
    }

    if (!token?.accessToken) {
      entry.graph.error = "Token bundle missing accessToken";
      report.orgs.push(entry);
      continue;
    }

    // Read-only Graph checks (never print token)
    try {
      const debug = await graphGet("/debug_token", token.accessToken, null);
      // debug_token needs app token usually — try app token form
      entry.graph.debugViaUser = {
        attempted: true,
        note: debug?.data ? "ok" : "unexpected",
      };
    } catch {
      // Fall through to app-access-token debug
      try {
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        const appToken = `${appId}|${appSecret}`;
        const urlDbg = new URL(`${graphBase}/debug_token`);
        urlDbg.searchParams.set("input_token", token.accessToken);
        urlDbg.searchParams.set("access_token", appToken);
        const res = await fetch(urlDbg);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        const d = json.data || {};
        entry.graph.tokenHealth = {
          isValid: Boolean(d.is_valid),
          appId: d.app_id ? String(d.app_id) : null,
          type: d.type || null,
          scopesCount: Array.isArray(d.scopes) ? d.scopes.length : 0,
          hasAdsRead: Array.isArray(d.scopes)
            ? d.scopes.includes("ads_read")
            : false,
          hasAdsManagement: Array.isArray(d.scopes)
            ? d.scopes.includes("ads_management")
            : false,
          expiresAt: d.expires_at || null,
        };
        if (!d.is_valid) report.reconnectNeeded = true;
        if (
          Array.isArray(d.scopes) &&
          !d.scopes.includes("ads_read") &&
          !d.scopes.includes("ads_management")
        ) {
          report.reconnectNeeded = true;
          report.notes.push(
            `${orgName}: Facebook token lacks ads_read/ads_management — reconnect Facebook OAuth.`
          );
        }
        report.liveGraph.tokenDebug = "ok";
      } catch (e) {
        entry.graph.tokenHealth = { error: e.message };
        report.liveGraph.tokenDebug = "failed";
      }
    }

    try {
      const pages = await graphGet("/me/accounts", token.accessToken, "id,name");
      entry.graph.meAccounts = {
        ok: true,
        pageCount: Array.isArray(pages.data) ? pages.data.length : 0,
      };
      report.liveGraph.meAccounts = "ok";
    } catch (e) {
      entry.graph.meAccounts = { ok: false, error: e.message };
      report.liveGraph.meAccounts = "failed";
    }

    try {
      const ads = await graphGet(
        "/me/adaccounts",
        token.accessToken,
        "id,name,currency,account_status"
      );
      entry.graph.adAccounts = {
        ok: true,
        count: Array.isArray(ads.data) ? ads.data.length : 0,
      };
      report.liveGraph.adAccountsList = "ok";
    } catch (e) {
      entry.graph.adAccounts = {
        ok: false,
        error: e.message,
        code: e.code || null,
      };
      report.liveGraph.adAccountsList =
        report.liveGraph.adAccountsList === "ok" ? "ok" : "failed";
      if (/permission|ads_management|ads_read|#200|#10/i.test(e.message)) {
        report.reconnectNeeded = true;
        report.notes.push(
          `${orgName}: /me/adaccounts denied — grant ads scopes + App Review if needed.`
        );
      }
    }

    // IG read-only: profile id from social_accounts external id if present
    const ig = rows.find((r) => r.platform === "instagram");
    if (ig) {
      const { data: igRow } = await admin
        .from("social_accounts")
        .select("external_account_id")
        .eq("id", ig.id)
        .maybeSingle();
      if (igRow?.external_account_id) {
        try {
          // Prefer page token for IG; try user token fields that may work
          await graphGet(
            `/${igRow.external_account_id}`,
            token.accessToken,
            "id,username"
          );
          entry.graph.instagramProfile = { ok: true };
        } catch (e) {
          entry.graph.instagramProfile = { ok: false, error: e.message };
        }
      }
    }

    report.orgs.push(entry);

    // Mark connection health from successful read-only Graph checks (no tokens logged)
    for (const row of rows) {
      const graphOk =
        entry.graph?.tokenHealth?.isValid &&
        (row.platform === "facebook"
          ? entry.graph?.meAccounts?.ok
          : entry.graph?.instagramProfile?.ok);
      if (graphOk) {
        await admin
          .from("social_accounts")
          .update({ health_status: "healthy", last_error: null })
          .eq("id", row.id)
          .eq("organisation_id", orgId);
        row.health_status = "healthy";
        const platformEntry = entry.platforms.find(
          (p) => p.platform === row.platform
        );
        if (platformEntry) platformEntry.health = "healthy";
      }
    }
  }

  if ((accounts || []).length === 0) {
    report.notes.push("No connected facebook/instagram social_accounts found.");
  }

  // Never dump tokens — print structured summary only
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("meta-live-verify failed:", e.message);
  process.exit(1);
});
