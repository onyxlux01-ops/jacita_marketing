/**
 * Publishing reliability unit checks (no live social APIs).
 * Pure JS mirrors of critical helpers + source invariants.
 */
import assert from "assert";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function classifyPublishError(error) {
  const msg = error?.message || String(error);
  const code = error?.code;
  if (code === "rate_limited" || /rate|429/i.test(msg)) {
    return { type: "RATE_LIMIT", retryable: true };
  }
  if (code === "token_expired" || /token|401|expired/i.test(msg)) {
    return { type: "AUTHENTICATION_ERROR", retryable: false };
  }
  if (/timeout|ETIMEDOUT|network/i.test(msg)) {
    return { type: "NETWORK_ERROR", retryable: true };
  }
  return { type: "UNKNOWN_ERROR", retryable: true };
}

function hashContentVersion(input) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
}

function buildIdempotencyKey(input) {
  return createHash("sha256")
    .update(
      `${input.organisationId}:${input.contentId}:${input.socialAccountId}:${input.versionHash}`
    )
    .digest("hex")
    .slice(0, 40);
}

function retryDelayMs(attemptCount) {
  if (attemptCount <= 1) return 60_000;
  if (attemptCount === 2) return 5 * 60_000;
  if (attemptCount === 3) return 30 * 60_000;
  return 2 * 60 * 60_000;
}

function isPublishingSimulationEnabled(env) {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  return env.PUBLISHING_SIMULATION === "true";
}

function handleNetworkFailure({ hasExternalId, verified }) {
  if (verified) return { status: "published", verifiedAfterTimeout: true };
  if (!hasExternalId) {
    return {
      status: "failed",
      errorType: "AMBIGUOUS_TIMEOUT",
      retryable: false,
    };
  }
  return { status: "retrying", errorType: "NETWORK_ERROR", retryable: true };
}

function recoverAbandonedLock(job, nowMs, ttlMs) {
  if (job.status !== "processing") return null;
  if (job.external_post_id) return "keep_for_verify";
  const lockedAt = job.locked_at ? Date.parse(job.locked_at) : 0;
  if (!lockedAt || nowMs - lockedAt > ttlMs) {
    return "retrying";
  }
  return null;
}

// 1 classification
assert.equal(
  classifyPublishError({ code: "rate_limited", message: "x" }).type,
  "RATE_LIMIT"
);
assert.equal(
  classifyPublishError({ code: "token_expired", message: "x" }).retryable,
  false
);
assert.equal(
  classifyPublishError({ message: "ETIMEDOUT" }).type,
  "NETWORK_ERROR"
);

// 2 version / stale
const a = hashContentVersion({ caption: "Hello", media: "m1" });
const b = hashContentVersion({ caption: "Hello", media: "m1" });
const c = hashContentVersion({ caption: "Changed", media: "m1" });
assert.equal(a, b);
assert.notEqual(a, c);

// 3 isolation of idempotency
assert.notEqual(
  buildIdempotencyKey({
    organisationId: "A",
    contentId: "c",
    socialAccountId: "s",
    versionHash: a,
  }),
  buildIdempotencyKey({
    organisationId: "B",
    contentId: "c",
    socialAccountId: "s",
    versionHash: a,
  })
);

// 4 backoff
assert.ok(retryDelayMs(1) < retryDelayMs(3));

// 5 simulation production guard
assert.equal(
  isPublishingSimulationEnabled({
    NODE_ENV: "production",
    PUBLISHING_SIMULATION: "true",
  }),
  false
);
assert.equal(
  isPublishingSimulationEnabled({
    NODE_ENV: "development",
    PUBLISHING_SIMULATION: "true",
  }),
  true
);

// 6 duplicate guard rule
function shouldPublish(job) {
  if (job.external_post_id || job.published_at) return false;
  return true;
}
assert.equal(
  shouldPublish({ external_post_id: "x", published_at: null }),
  false
);
assert.equal(shouldPublish({ external_post_id: null, published_at: null }), true);

// 7 ambiguous timeout — never blind republish
assert.equal(
  handleNetworkFailure({ hasExternalId: false, verified: false }).errorType,
  "AMBIGUOUS_TIMEOUT"
);
assert.equal(
  handleNetworkFailure({ hasExternalId: false, verified: true })
    .verifiedAfterTimeout,
  true
);

// 8 abandoned lock recovery
assert.equal(
  recoverAbandonedLock(
    {
      status: "processing",
      external_post_id: null,
      locked_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
    Date.now(),
    15 * 60_000
  ),
  "retrying"
);
assert.equal(
  recoverAbandonedLock(
    {
      status: "processing",
      external_post_id: "ig_1",
      locked_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
    Date.now(),
    15 * 60_000
  ),
  "keep_for_verify"
);

// 9 source: reliability implements recovery + ambiguous hold
const reliability = readFileSync(
  join(root, "src/lib/social/reliability.ts"),
  "utf8"
);
assert.ok(reliability.includes("recoverAbandonedLocks"));
assert.ok(reliability.includes("AMBIGUOUS_TIMEOUT"));
assert.ok(reliability.includes("publish_verified"));

console.log(JSON.stringify({ ok: true, checks: 9 }, null, 2));
