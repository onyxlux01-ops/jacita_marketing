/**
 * Controlled e2e: seed media → simulated publish → live labeled publish → PAUSED ads.
 *
 * Usage examples (PowerShell):
 *   $env:PUBLISHING_SIMULATION='true'; $env:NODE_ENV='development'; npx --yes tsx --env-file=.env.local scripts/e2e-publish-and-ads.ts --mode=simulate
 *   $env:PUBLISHING_SIMULATION='false'; npx --yes tsx --env-file=.env.local scripts/e2e-publish-and-ads.ts --mode=live
 *   npx --yes tsx --env-file=.env.local scripts/e2e-publish-and-ads.ts --mode=ads
 *   npx --yes tsx --env-file=.env.local scripts/e2e-publish-and-ads.ts --mode=verify --content-id=<id>
 *
 * Does not write PUBLISHING_SIMULATION into .env.local.
 */
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const ORG_ID = "f0946484-e165-4348-8f81-fa229f992d6b";
const USER_ID = "8c6e5379-d193-4a5e-8bb5-d34ee794b015";
const META_AD_ACCOUNT_ID = "1e5d53d6-7ce9-4044-87fa-217a8cf0941a";

type Mode = "simulate" | "live" | "ads" | "verify" | "seed-media";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function modeFromArgs(): Mode {
  const m = (arg("mode") || "simulate") as Mode;
  if (!["simulate", "live", "ads", "verify", "seed-media"].includes(m)) {
    throw new Error(`Unknown mode: ${m}`);
  }
  return m;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Minimal valid 1x1 JPEG */
function tinyJpeg(): Buffer {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z",
    "base64"
  );
}

async function ensureTestMedia(admin: ReturnType<typeof adminClient>) {
  const { data: existing } = await admin
    .from("media_assets")
    .select("id, storage_path")
    .eq("organisation_id", ORG_ID)
    .eq("is_active", true)
    .eq("media_type", "image")
    .ilike("description", "%Jacita system test%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { mediaId: existing.id as string, reused: true };
  }

  const storagePath = `${ORG_ID}/${randomUUID()}.jpg`;
  const bytes = tinyJpeg();
  const { error: upErr } = await admin.storage
    .from("media")
    .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(`Media upload failed: ${upErr.message}`);

  const { data: row, error } = await admin
    .from("media_assets")
    .insert({
      organisation_id: ORG_ID,
      storage_path: storagePath,
      file_url: storagePath,
      media_type: "image",
      description:
        "Jacita system test image (safe to delete) — used for pipeline verification",
      category: "system_test",
      uploaded_by: USER_ID,
      width: 1,
      height: 1,
      file_size_bytes: bytes.length,
    })
    .select("id")
    .single();
  if (error) throw new Error(`media_assets insert: ${error.message}`);
  return { mediaId: row.id as string, reused: false };
}

async function createTestContent(
  admin: ReturnType<typeof adminClient>,
  input: {
    mediaId: string;
    caption: string;
    title: string;
    platforms: Array<"facebook" | "instagram">;
  }
) {
  const { data: content, error } = await admin
    .from("content")
    .insert({
      organisation_id: ORG_ID,
      title: input.title,
      caption: input.caption,
      content_type: "image",
      media_asset_id: input.mediaId,
      status: "approved",
      created_by: USER_ID,
      hashtags: ["JacitaSystemTest"],
    })
    .select("id")
    .single();
  if (error) throw new Error(`content insert: ${error.message}`);

  for (const platform of input.platforms) {
    const { error: cpErr } = await admin.from("content_platforms").insert({
      content_id: content.id,
      platform,
      publish_status: "draft",
    });
    if (cpErr) throw new Error(`content_platforms insert: ${cpErr.message}`);
  }

  const { data: accounts } = await admin
    .from("social_accounts")
    .select("id, platform")
    .eq("organisation_id", ORG_ID)
    .eq("connection_status", "connected")
    .in("platform", input.platforms);

  return {
    contentId: content.id as string,
    accounts: (accounts || []) as Array<{
      id: string;
      platform: "facebook" | "instagram";
    }>,
  };
}

async function publishViaPipeline(contentId: string, socialAccountId: string) {
  const { publishContentViaJobPipeline } = await import(
    "../src/lib/social/scheduler"
  );
  return publishContentViaJobPipeline({
    contentId,
    socialAccountId,
    userId: USER_ID,
  });
}

async function collectEvidence(admin: ReturnType<typeof adminClient>, contentId: string) {
  const [{ data: jobs }, { data: platforms }, { data: logs }, { data: obs }] =
    await Promise.all([
      admin
        .from("social_publish_jobs")
        .select(
          "id, platform, status, external_post_id, error_type, error_message, published_at, attempt_count"
        )
        .eq("content_id", contentId)
        .order("created_at", { ascending: true }),
      admin
        .from("content_platforms")
        .select(
          "id, platform, publish_status, external_post_id, published_at, error_message"
        )
        .eq("content_id", contentId),
      admin
        .from("social_publish_logs")
        .select(
          "id, platform, status, external_post_id, error_type, request_summary, response_summary, created_at"
        )
        .eq("content_id", contentId)
        .order("created_at", { ascending: true }),
      admin
        .from("publishing_observations")
        .select("id, platform, result, error_type, job_id, created_at")
        .eq("content_id", contentId)
        .order("created_at", { ascending: true }),
    ]);

  return { jobs, platforms, logs, observations: obs };
}

async function runSimulate() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refuse simulation under NODE_ENV=production");
  }
  process.env.PUBLISHING_SIMULATION = "true";
  process.env.PUBLISHING_SIMULATION_SCENARIO =
    process.env.PUBLISHING_SIMULATION_SCENARIO || "success";

  const admin = adminClient();
  const media = await ensureTestMedia(admin);
  const created = await createTestContent(admin, {
    mediaId: media.mediaId,
    title: "[SIM] Jacita publish dry-run",
    caption:
      "Jacita system TEST (simulation only — no real Meta post). Safe to ignore/delete.",
    platforms: ["facebook", "instagram"],
  });

  const results: Record<string, unknown> = {};
  for (const account of created.accounts) {
    results[account.platform] = await publishViaPipeline(
      created.contentId,
      account.id
    );
  }

  // Second pass — must be duplicate-safe
  const rerun: Record<string, unknown> = {};
  for (const account of created.accounts) {
    rerun[account.platform] = await publishViaPipeline(
      created.contentId,
      account.id
    );
  }

  const evidence = await collectEvidence(admin, created.contentId);
  return {
    mode: "simulate",
    simulationEnabled: process.env.PUBLISHING_SIMULATION,
    scenario: process.env.PUBLISHING_SIMULATION_SCENARIO,
    media,
    contentId: created.contentId,
    firstPass: results,
    secondPass: rerun,
    evidence,
  };
}

async function runLive() {
  // Explicitly disable simulation for this process
  process.env.PUBLISHING_SIMULATION = "false";
  delete process.env.PUBLISHING_SIMULATION_SCENARIO;

  const admin = adminClient();
  const media = await ensureTestMedia(admin);
  const created = await createTestContent(admin, {
    mediaId: media.mediaId,
    title: "[LIVE TEST] Jacita system test — delete me",
    caption:
      "Jacita system TEST post — this will be deleted. Not a real promotion. Posted only to verify Jacita Meta publishing. Please ignore / delete.",
    platforms: ["facebook", "instagram"],
  });

  const results: Record<string, unknown> = {};
  for (const account of created.accounts) {
    results[account.platform] = await publishViaPipeline(
      created.contentId,
      account.id
    );
  }

  const rerun: Record<string, unknown> = {};
  for (const account of created.accounts) {
    rerun[account.platform] = await publishViaPipeline(
      created.contentId,
      account.id
    );
  }

  const evidence = await collectEvidence(admin, created.contentId);
  return {
    mode: "live",
    simulationEnabled: process.env.PUBLISHING_SIMULATION,
    media,
    contentId: created.contentId,
    firstPass: results,
    secondPass: rerun,
    evidence,
  };
}

async function runAds() {
  process.env.PUBLISHING_SIMULATION = "false";
  const {
    updateAdvertisingSettings,
    proposeAdvertisingAction,
    approveAndExecuteAdvertisingAction,
    ensureAdvertisingSettings,
  } = await import("../src/lib/ads/service");

  // Keep approval mode; ensure small positive daily limit (already 5000; leave if higher)
  const settings = await ensureAdvertisingSettings(ORG_ID);
  let settingsResult: unknown = {
    existing: {
      mode: settings.mode,
      daily_spend_limit_cents: settings.daily_spend_limit_cents,
    },
  };
  if (settings.daily_spend_limit_cents <= 0) {
    settingsResult = await updateAdvertisingSettings({
      organisationId: ORG_ID,
      userId: USER_ID,
      dailySpendLimitCents: 100, // $1
      maxActiveCampaigns: 5,
      mode: "approval",
    });
  } else if (settings.mode !== "approval") {
    settingsResult = await updateAdvertisingSettings({
      organisationId: ORG_ID,
      userId: USER_ID,
      mode: "approval",
    });
  }

  const proposed = await proposeAdvertisingAction({
    organisationId: ORG_ID,
    userId: USER_ID,
    actionType: "CREATE_CAMPAIGN",
    metaAdAccountId: META_AD_ACCOUNT_ID,
    proposedBy: "user",
    payload: {
      name: "Jacita system TEST campaign (PAUSED — delete me)",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      dailyBudgetCents: 100, // $1, well under limit
      specialAdCategories: [],
    },
  });

  if ("error" in proposed) {
    return { mode: "ads", settingsResult, proposed };
  }

  const approved = await approveAndExecuteAdvertisingAction({
    organisationId: ORG_ID,
    userId: USER_ID,
    actionId: proposed.action.id,
  });

  const admin = adminClient();
  const [{ data: actionRow }, { data: campaigns }, { data: audits }] =
    await Promise.all([
      admin
        .from("advertising_actions")
        .select("id, status, error_message, external_ids, result")
        .eq("id", proposed.action.id)
        .maybeSingle(),
      admin
        .from("meta_ad_campaigns")
        .select(
          "id, name, status, effective_status, external_campaign_id, daily_budget_cents"
        )
        .eq("organisation_id", ORG_ID)
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, metadata, created_at")
        .eq("organisation_id", ORG_ID)
        .ilike("action", "ads.%")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  return {
    mode: "ads",
    settingsResult,
    proposedActionId: proposed.action.id,
    approved,
    actionRow,
    campaigns,
    audits,
  };
}

async function runVerify(contentId: string) {
  const admin = adminClient();
  return {
    mode: "verify",
    contentId,
    evidence: await collectEvidence(admin, contentId),
  };
}

async function main() {
  const mode = modeFromArgs();
  let report: unknown;

  if (mode === "seed-media") {
    const media = await ensureTestMedia(adminClient());
    report = { mode, media };
  } else if (mode === "simulate") {
    report = await runSimulate();
  } else if (mode === "live") {
    report = await runLive();
  } else if (mode === "ads") {
    report = await runAds();
  } else {
    const contentId = arg("content-id");
    if (!contentId) throw new Error("--content-id required for verify");
    report = await runVerify(contentId);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  );
  process.exit(1);
});
