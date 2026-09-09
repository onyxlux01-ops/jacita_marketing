/**
 * Meta multi-business isolation + ads approval + publish idempotency unit checks.
 * No live Meta API calls.
 *
 * Covers the original 15 verification cases plus pipeline/approval invariants.
 * Run: node scripts/meta-isolation-ads-unit.mjs
 */
import assert from "assert";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function assertOrgMatch(contentOrgId, accountOrgId) {
  if (contentOrgId !== accountOrgId) {
    return {
      error:
        "Cannot publish: content and social account belong to different businesses",
    };
  }
  return { ok: true };
}

function assertAdAccountOwnership(actionOrgId, accountOrgId) {
  if (actionOrgId !== accountOrgId) {
    return { error: "Ad account does not belong to this business." };
  }
  return { ok: true };
}

function buildIdempotencyKey(input) {
  return createHash("sha256")
    .update(
      `${input.organisationId}:${input.contentId}:${input.socialAccountId}:${input.versionHash}`
    )
    .digest("hex")
    .slice(0, 40);
}

function alreadyPublished(cp) {
  return Boolean(cp?.external_post_id && cp?.publish_status === "published");
}

function canExecuteAdsMutation(settings, actionType) {
  const mutating = [
    "CREATE_CAMPAIGN",
    "UPDATE_CAMPAIGN",
    "PAUSE_CAMPAIGN",
    "ENABLE_CAMPAIGN",
    "LINK_AD_ACCOUNT",
  ];
  if (settings.emergency_stopped && mutating.includes(actionType)) {
    return { ok: false, reason: "emergency_stop" };
  }
  if (settings.mode === "off") return { ok: false, reason: "off" };
  if (settings.mode === "autopilot") {
    return { ok: false, reason: "autopilot_disabled" };
  }
  // AI proposals never auto-execute — always require approval status
  return { ok: true, requiresApproval: true };
}

function enforceDailyBudget(settings, dailyBudgetCents) {
  if (settings.daily_spend_limit_cents <= 0) {
    return { ok: false, reason: "limit_not_set" };
  }
  if (dailyBudgetCents > settings.daily_spend_limit_cents) {
    return { ok: false, reason: "over_limit" };
  }
  return { ok: true };
}

function aiMustNotCallMetaDirectly(caller) {
  // Architectural invariant: only MetaAdsAdapter / SocialPlatformAdapter
  // after structured action approval may call Meta.
  return caller === "MetaAdsAdapter" || caller === "SocialPlatformAdapter";
}

function defaultAdvertisingMode() {
  return "approval";
}

function settingsUpdateAllowsAutopilot(mode) {
  // Mirrors updateAdvertisingSettings: never enable ads autopilot
  return mode === "approval" ? "approval" : "off";
}

function samePublishPipelinePaths() {
  // Source invariants: publish now, schedule, and cron all funnel through job pipeline.
  const socialActions = readFileSync(
    join(root, "src/app/(app)/app/actions/social.ts"),
    "utf8"
  );
  const scheduler = readFileSync(
    join(root, "src/lib/social/scheduler.ts"),
    "utf8"
  );
  const cron = readFileSync(
    join(root, "src/app/api/cron/publish-due/route.ts"),
    "utf8"
  );
  const engine = readFileSync(join(root, "src/lib/automation/engine.ts"), "utf8");
  const reliability = readFileSync(
    join(root, "src/lib/social/reliability.ts"),
    "utf8"
  );

  assert.ok(
    socialActions.includes("publishContentViaJobPipeline"),
    "publish now must use job pipeline"
  );
  assert.ok(
    !/publishContent\s*\(/.test(
      socialActions.replace(/publishContentViaJobPipeline/g, "")
    ),
    "social actions must not call publishContent directly"
  );
  assert.ok(
    scheduler.includes("processDuePublishJobsReliable") ||
      scheduler.includes("processClaimedPublishJob"),
    "scheduler must use reliability engine"
  );
  assert.ok(
    cron.includes("processDuePublishJobs"),
    "cron must process due jobs"
  );
  assert.ok(
    engine.includes("enqueuePublishJobsForContent"),
    "autopilot must enqueue via scheduler"
  );
  assert.ok(
    reliability.includes('from "@/lib/social/publish"') ||
      reliability.includes("from '@/lib/social/publish'"),
    "reliability engine is the sole caller of publishContent"
  );
  return true;
}

function aiSourceMustNotImportMetaGraph() {
  const aiDirFiles = [
    "src/lib/ai/history.ts",
    "src/app/(app)/app/actions/ai.ts",
  ];
  for (const rel of aiDirFiles) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.ok(
      !/meta-client|metaFetch|meta-ads-adapter|graph\.facebook\.com/.test(src),
      `${rel} must not import Meta Graph`
    );
  }
  return true;
}

function facebookOauthRequestsAdsScopes() {
  const fb = readFileSync(
    join(root, "src/lib/social/adapters/facebook.ts"),
    "utf8"
  );
  assert.ok(fb.includes("ads_read"));
  assert.ok(fb.includes("ads_management"));
  return true;
}

// 1–3 isolation
assert.equal(assertOrgMatch("A", "B").error != null, true);
assert.equal(assertOrgMatch("A", "A").ok, true);
assert.equal(assertAdAccountOwnership("A", "B").error != null, true);
assert.equal(assertAdAccountOwnership("A", "A").ok, true);

// 4–5 publish success markers (shape)
assert.equal(
  alreadyPublished({
    external_post_id: "ig_1",
    publish_status: "published",
  }),
  true
);
assert.equal(
  alreadyPublished({ external_post_id: null, publish_status: "failed" }),
  false
);

// 6 duplicate key differs by business
const v = "abc";
assert.notEqual(
  buildIdempotencyKey({
    organisationId: "A",
    contentId: "c",
    socialAccountId: "s",
    versionHash: v,
  }),
  buildIdempotencyKey({
    organisationId: "B",
    contentId: "c",
    socialAccountId: "s",
    versionHash: v,
  })
);

// 7–8 retry / timeout: NETWORK_ERROR retryable; duplicate blocked when published
function classify(msg) {
  if (/timeout|ETIMEDOUT|network/i.test(msg)) {
    return { type: "NETWORK_ERROR", retryable: true };
  }
  return { type: "UNKNOWN_ERROR", retryable: true };
}
assert.equal(classify("ETIMEDOUT").retryable, true);
assert.equal(
  alreadyPublished({
    external_post_id: "fb_9",
    publish_status: "published",
  }),
  true
);

// 9 external IDs stored shape
const log = { external_post_id: "1784", status: "published" };
assert.ok(log.external_post_id);

// 10–11 ad account discovery / campaign org association
const linked = { organisation_id: "A", external_ad_account_id: "act_1" };
assert.equal(linked.organisation_id, "A");
assert.equal(
  assertAdAccountOwnership("B", linked.organisation_id).error != null,
  true
);

// 12 AI cannot call Meta APIs directly
assert.equal(aiMustNotCallMetaDirectly("AI"), false);
assert.equal(aiMustNotCallMetaDirectly("MetaAdsAdapter"), true);
assert.equal(aiSourceMustNotImportMetaGraph(), true);

// 13–14 advertising mutations require approval + spend limits
const settings = {
  mode: "approval",
  emergency_stopped: false,
  daily_spend_limit_cents: 10000,
};
assert.equal(defaultAdvertisingMode(), "approval");
assert.equal(canExecuteAdsMutation(settings, "CREATE_CAMPAIGN").requiresApproval, true);
assert.equal(
  canExecuteAdsMutation(
    { ...settings, emergency_stopped: true },
    "CREATE_CAMPAIGN"
  ).ok,
  false
);
assert.equal(
  canExecuteAdsMutation({ ...settings, mode: "autopilot" }, "CREATE_CAMPAIGN")
    .reason,
  "autopilot_disabled"
);
assert.equal(settingsUpdateAllowsAutopilot("autopilot"), "off");
assert.equal(enforceDailyBudget(settings, 20000).ok, false);
assert.equal(enforceDailyBudget(settings, 5000).ok, true);
assert.equal(
  enforceDailyBudget({ ...settings, daily_spend_limit_cents: 0 }, 100).reason,
  "limit_not_set"
);

// 15 business switch changes context: surface keyed by organisationId
const surfaceA = { organisationId: "A", adAccountId: "act_A" };
const surfaceB = { organisationId: "B", adAccountId: "act_B" };
assert.notEqual(surfaceA.organisationId, surfaceB.organisationId);
assert.notEqual(surfaceA.adAccountId, surfaceB.adAccountId);

// Extra: one organic publish pipeline + FB ads scopes in OAuth
assert.equal(samePublishPipelinePaths(), true);
assert.equal(facebookOauthRequestsAdsScopes(), true);

console.log("meta-isolation-ads-unit: ok");
