/**
 * PR 5: account identity safety — account switches hold queued jobs, the
 * OAuth state is single-use and bound to the Meta app it started with, and
 * per-business Meta credentials never silently fall back to the global app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actAs,
  admin,
  connectAccount,
  createContent,
  jobsFor,
  soon,
  teamOrg,
} from "../helpers.ts";
import { itest } from "../state.ts";

const social = () => import("../../../src/app/(app)/app/actions/social");
const scheduler = () => import("../../../src/lib/social/scheduler");
const oauth = () => import("../../../src/lib/social/oauth-state");
const creds = () => import("../../../src/lib/social/meta-app-credentials");
const callbackRoute = () =>
  import("../../../src/app/api/social/oauth/[platform]/callback/route");
const startRoute = () =>
  import("../../../src/app/api/social/oauth/[platform]/start/route");

function pagesFixture(pages: Array<{ id: string; name: string }>) {
  itest.metaFetch = (path) => {
    if (path === "/me/accounts") {
      return {
        data: pages.map((p) => ({ ...p, access_token: `token-${p.id}` })),
      };
    }
    throw new Error(`unexpected Graph path ${path}`);
  };
}

test("identity: switching the Facebook Page holds queued jobs for re-approval", async () => {
  const { orgId, manager, staff } = await teamOrg("switch");
  await admin
    .from("automation_settings")
    .upsert({ organisation_id: orgId, mode: "approval", enabled: true });
  const pages = [
    { id: "page-A", name: "Page A" },
    { id: "page-B", name: "Page B" },
  ];
  const fb = await connectAccount(orgId, "facebook", "page-A", {
    available_pages: pages,
    page_id: "page-A",
  });

  // A queued (pending) post approved for Page A.
  const queued = await createContent(orgId, manager.id, "approved");
  const { scheduleContentPublishing, selectFacebookPage } = await social();
  actAs(manager);
  const sched = await scheduleContentPublishing({
    contentId: queued.contentId,
    organisationId: orgId,
    scheduledAt: soon(),
  });
  actAs(null);
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));
  assert.equal((await jobsFor(queued.contentId))[0].target_external_account_id, "page-A");

  // An in-flight (processing) post for Page A.
  const inflight = await createContent(orgId, manager.id, "publishing");
  const { data: procJob } = await admin
    .from("social_publish_jobs")
    .insert({
      organisation_id: orgId,
      content_id: inflight.contentId,
      content_platform_id: inflight.platformIds.facebook,
      social_account_id: fb,
      platform: "facebook",
      status: "processing",
      scheduled_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      lock_token: "worker-1",
      created_by: manager.id,
      target_external_account_id: "page-A",
    })
    .select("id")
    .single();

  pagesFixture(pages);

  // Staff may not switch.
  actAs(staff);
  const byStaff = await selectFacebookPage({ organisationId: orgId, pageId: "page-B" });
  assert.ok("error" in byStaff && byStaff.error);

  actAs(manager);
  const res = await selectFacebookPage({ organisationId: orgId, pageId: "page-B" });
  actAs(null);
  assert.ok("success" in res && res.success, JSON.stringify(res));

  const [heldJob] = await jobsFor(queued.contentId);
  assert.equal(heldJob.status, "held");
  assert.equal(heldJob.hold_reason, "ACCOUNT_CHANGED");
  const { data: content } = await admin
    .from("content")
    .select("status")
    .eq("id", queued.contentId)
    .single();
  assert.equal(content?.status, "review");

  // Processing job is flagged, not interrupted.
  const { data: proc } = await admin
    .from("social_publish_jobs")
    .select("status, hold_reason, lock_token")
    .eq("id", procJob!.id)
    .single();
  assert.deepEqual(proc, {
    status: "processing",
    hold_reason: "ACCOUNT_CHANGED",
    lock_token: "worker-1",
  });

  const { data: account } = await admin
    .from("social_accounts")
    .select("external_account_id")
    .eq("id", fb)
    .single();
  assert.equal(account?.external_account_id, "page-B");

  const { loadAccountSecrets } = await import("../../../src/lib/social/secrets");
  const token = await loadAccountSecrets(fb, orgId);
  assert.equal(token?.pageAccessToken, "token-page-B");

  const { data: audit } = await admin
    .from("audit_logs")
    .select("metadata")
    .eq("organisation_id", orgId)
    .eq("action", "social.account_switched");
  assert.equal(audit?.length, 1);
  assert.deepEqual(
    {
      old: (audit![0].metadata as Record<string, unknown>).old_external_account_id,
      next: (audit![0].metadata as Record<string, unknown>).new_external_account_id,
    },
    { old: "page-A", next: "page-B" }
  );

  // If the in-flight job later goes back to retrying, the worker refuses to
  // send it to Page B.
  await admin
    .from("social_publish_jobs")
    .update({ status: "retrying", next_retry_at: null, locked_at: null, lock_token: null })
    .eq("id", procJob!.id);
  await admin.from("content").update({ status: "scheduled" }).eq("id", inflight.contentId);
  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs(50);
  const { data: after } = await admin
    .from("social_publish_jobs")
    .select("status, hold_reason")
    .eq("id", procJob!.id)
    .single();
  assert.deepEqual(after, { status: "held", hold_reason: "ACCOUNT_CHANGED" });
  assert.equal(
    itest.publishCalls.filter(
      (c) => c.contentId === inflight.contentId || c.contentId === queued.contentId
    ).length,
    0
  );
  itest.metaFetch = null;
});

test("identity: OAuth state is single-use, user-bound and expires", async () => {
  const { orgId, owner, manager } = await teamOrg("oauthstate");
  const { createOAuthState, consumeOAuthState } = await oauth();

  const state = await createOAuthState({
    organisationId: orgId,
    userId: owner.id,
    platform: "facebook",
  });
  // Wrong user / platform cannot consume (and does not burn it).
  assert.equal(await consumeOAuthState({ state, userId: manager.id, platform: "facebook" }), null);
  assert.equal(await consumeOAuthState({ state, userId: owner.id, platform: "instagram" }), null);

  // Concurrent consumption: exactly one winner.
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      consumeOAuthState({ state, userId: owner.id, platform: "facebook" })
    )
  );
  assert.equal(results.filter(Boolean).length, 1);
  // Replay afterwards is rejected.
  assert.equal(await consumeOAuthState({ state, userId: owner.id, platform: "facebook" }), null);

  const expired = await createOAuthState({
    organisationId: orgId,
    userId: owner.id,
    platform: "facebook",
  });
  await admin
    .from("social_oauth_states")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("state", expired);
  assert.equal(
    await consumeOAuthState({ state: expired, userId: owner.id, platform: "facebook" }),
    null
  );
});

test("identity: OAuth callback replay and Meta app mismatch are rejected", async () => {
  const { orgId, owner } = await teamOrg("oauthcb");
  const { createOAuthState } = await oauth();
  const { saveOrgMetaApp } = await creds();
  const { GET } = await callbackRoute();
  await saveOrgMetaApp({
    organisationId: orgId,
    appId: "2000000000002",
    appSecret: "itest-org-app-secret-value-0000",
  });

  async function callback(state: string) {
    actAs(owner);
    const res = await GET(
      new Request(
        `http://localhost:3000/api/social/oauth/facebook/callback?code=abc&state=${state}`
      ),
      { params: Promise.resolve({ platform: "facebook" }) }
    );
    actAs(null);
    return decodeURIComponent(res.headers.get("location") || "");
  }

  // Started with a different app than the business now uses → refused.
  const mismatched = await createOAuthState({
    organisationId: orgId,
    userId: owner.id,
    platform: "facebook",
    metadata: { meta_app_id: "1000000000001" },
  });
  const r1 = await callback(mismatched);
  assert.match(r1, /Meta app changed/);

  // Matching app: the state is consumed on first use (the mocked token
  // exchange then fails); the replay is rejected as invalid.
  const good = await createOAuthState({
    organisationId: orgId,
    userId: owner.id,
    platform: "facebook",
    metadata: { meta_app_id: "2000000000002" },
  });
  const first = await callback(good);
  assert.doesNotMatch(first, /Invalid or expired/);
  const replay = await callback(good);
  assert.match(replay, /Invalid or expired OAuth state/);
});

test("identity: start route records the business's Meta app in the state", async () => {
  const { orgId, owner } = await teamOrg("oauthstart");
  const { saveOrgMetaApp } = await creds();
  await saveOrgMetaApp({
    organisationId: orgId,
    appId: "3000000000003",
    appSecret: "itest-org-app-secret-value-3333",
  });
  const { GET } = await startRoute();
  actAs(owner);
  const res = await GET(
    new Request(
      `http://localhost:3000/api/social/oauth/facebook/start?organisation_id=${orgId}`
    ),
    { params: Promise.resolve({ platform: "facebook" }) }
  );
  actAs(null);
  const location = res.headers.get("location") || "";
  assert.match(location, /client_id=3000000000003/);
  const state = new URL(location).searchParams.get("state");
  const { data } = await admin
    .from("social_oauth_states")
    .select("metadata")
    .eq("state", state!)
    .single();
  assert.equal((data?.metadata as Record<string, unknown>).meta_app_id, "3000000000003");
});

test("identity: corrupt per-business Meta app fails loudly (no global fallback)", async () => {
  const { orgId, owner } = await teamOrg("corruptapp");
  await admin.from("organisation_meta_apps").insert({
    organisation_id: orgId,
    app_id: "4000000000004",
    ciphertext: "not-real",
    iv: "AAAAAAAAAAAAAAAA",
    auth_tag: "AAAAAAAAAAAAAAAAAAAAAA==",
  });
  const { getMetaAppCredentialsForOrg } = await creds();
  await assert.rejects(getMetaAppCredentialsForOrg(orgId), /could not be decrypted/);

  const { getPlatformConfigForOrg } = await import(
    "../../../src/lib/social/platform-config"
  );
  const cfg = await getPlatformConfigForOrg("facebook", orgId);
  assert.equal(cfg.configured, false);

  const { GET } = await startRoute();
  actAs(owner);
  const res = await GET(
    new Request(
      `http://localhost:3000/api/social/oauth/facebook/start?organisation_id=${orgId}`
    ),
    { params: Promise.resolve({ platform: "facebook" }) }
  );
  actAs(null);
  const location = decodeURIComponent(res.headers.get("location") || "");
  assert.match(location, /could not be decrypted/);
  assert.doesNotMatch(location, /client_id=1000000000001/);
});

test("identity: Meta app save/remove is owner/manager only and audited", async () => {
  const { orgId, manager, staff } = await teamOrg("metaaudit");
  const { saveOrgMetaAppCredentials, removeOrgMetaAppCredentials } = await social();

  actAs(staff);
  const denied = await saveOrgMetaAppCredentials({
    organisationId: orgId,
    appId: "5000000000005",
    appSecret: "itest-org-app-secret-value-5555",
  });
  assert.ok("error" in denied && denied.error);

  actAs(manager);
  const saved = await saveOrgMetaAppCredentials({
    organisationId: orgId,
    appId: "5000000000005",
    appSecret: "itest-org-app-secret-value-5555",
  });
  const removed = await removeOrgMetaAppCredentials({ organisationId: orgId });
  actAs(null);
  assert.deepEqual(saved, { success: true });
  assert.deepEqual(removed, { success: true });

  const { data: audit } = await admin
    .from("audit_logs")
    .select("action, metadata")
    .eq("organisation_id", orgId)
    .in("action", ["social.meta_app_saved", "social.meta_app_removed"])
    .order("created_at", { ascending: true });
  assert.deepEqual(
    audit?.map((a) => a.action),
    ["social.meta_app_saved", "social.meta_app_removed"]
  );
  assert.ok(!JSON.stringify(audit).includes("itest-org-app-secret"), "secret must not be logged");
});

async function queueApproved(
  orgId: string,
  managerId: string,
  platforms: Array<"facebook" | "instagram">
) {
  const c = await createContent(orgId, managerId, "approved", platforms);
  const { scheduleContentPublishing } = await social();
  return { ...c, scheduleContentPublishing };
}

test("identity: switching the Instagram account holds every platform of affected posts", async () => {
  const { orgId, manager } = await teamOrg("igswitch");
  const pages = [
    { id: "fbpage-1", name: "Page One", ig_user_id: "ig-1" },
    { id: "fbpage-2", name: "Page Two", ig_user_id: "ig-2" },
  ];
  await connectAccount(orgId, "facebook", "fbpage-1");
  const ig = await connectAccount(orgId, "instagram", "ig-1", {
    available_pages: pages,
    page_id: "fbpage-1",
    ig_user_id: "ig-1",
  });
  const q = await queueApproved(orgId, manager.id, ["facebook", "instagram"]);
  actAs(manager);
  const sched = await q.scheduleContentPublishing({
    contentId: q.contentId,
    organisationId: orgId,
    scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));

  itest.metaFetch = (path) => {
    if (path === "/me/accounts") {
      return {
        data: pages.map((p) => ({
          id: p.id,
          name: p.name,
          access_token: `token-${p.id}`,
          instagram_business_account: { id: p.ig_user_id },
        })),
      };
    }
    if (path === "/ig-2") return { id: "ig-2", username: "second", name: "Second" };
    throw new Error(`unexpected Graph path ${path}`);
  };
  const { selectInstagramPage } = await social();
  const res = await selectInstagramPage({ organisationId: orgId, pageId: "fbpage-2" });
  actAs(null);
  itest.metaFetch = null;
  assert.ok("success" in res && res.success, JSON.stringify(res));
  assert.equal((res as { heldJobs: number }).heldJobs, 1);
  assert.equal((res as { otherPlatformJobs: number }).otherPlatformJobs, 1);

  const jobs = await jobsFor(q.contentId);
  assert.deepEqual(
    jobs.map((j) => [j.platform, j.status, j.hold_reason]).sort(),
    [
      ["facebook", "held", "CONTENT_NOT_APPROVED"],
      ["instagram", "held", "ACCOUNT_CHANGED"],
    ]
  );
  const { data: rows } = await admin
    .from("content_platforms")
    .select("platform, publish_status")
    .eq("content_id", q.contentId);
  assert.ok(rows?.every((r) => r.publish_status === "held"), JSON.stringify(rows));
  const { data: acct } = await admin
    .from("social_accounts")
    .select("external_account_id, account_handle")
    .eq("id", ig)
    .single();
  assert.deepEqual(acct, { external_account_id: "ig-2", account_handle: "@second" });
});

test("identity: token-store failure restores the previous account", async () => {
  const { orgId, manager } = await teamOrg("tokenfail");
  const pages = [
    { id: "page-X", name: "Page X" },
    { id: "page-Y", name: "Page Y" },
  ];
  const fb = await connectAccount(orgId, "facebook", "page-X", {
    available_pages: pages,
    page_id: "page-X",
  });
  const realKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  itest.metaFetch = (path) => {
    if (path === "/me/accounts") {
      // The old token was already decrypted; break encryption so storing the
      // NEW token fails.
      process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "too-short";
      return { data: pages.map((p) => ({ ...p, access_token: `token-${p.id}` })) };
    }
    throw new Error(`unexpected Graph path ${path}`);
  };
  const { selectFacebookPage } = await social();
  actAs(manager);
  let res;
  try {
    res = await selectFacebookPage({ organisationId: orgId, pageId: "page-Y" });
  } finally {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = realKey;
    actAs(null);
    itest.metaFetch = null;
  }
  assert.ok("error" in res! && res!.error, JSON.stringify(res));
  assert.match(String((res as { error: string }).error), /previous account was kept/);
  const { data: acct } = await admin
    .from("social_accounts")
    .select("external_account_id, connection_status")
    .eq("id", fb)
    .single();
  assert.deepEqual(acct, { external_account_id: "page-X", connection_status: "connected" });
  const { loadAccountSecrets } = await import("../../../src/lib/social/secrets");
  const token = await loadAccountSecrets(fb, orgId);
  assert.equal(token?.pageAccessToken, "page-token", "old token still in the vault");
  const { data: audit } = await admin
    .from("audit_logs")
    .select("action")
    .eq("organisation_id", orgId)
    .in("action", ["social.account_switched", "social.account_switch_failed"]);
  assert.deepEqual(audit?.map((a) => a.action).sort(), [
    "social.account_switch_failed",
    "social.account_switched",
  ]);
});

test("identity: a job with no recorded target is held, never published", async () => {
  const { orgId, manager } = await teamOrg("notarget");
  await admin
    .from("automation_settings")
    .upsert({ organisation_id: orgId, mode: "approval", enabled: true });
  const fb = await connectAccount(orgId, "facebook", "page-T");
  const { contentId, platformIds } = await createContent(orgId, manager.id, "scheduled");
  await admin.from("social_publish_jobs").insert({
    organisation_id: orgId,
    content_id: contentId,
    content_platform_id: platformIds.facebook,
    social_account_id: fb,
    platform: "facebook",
    status: "pending",
    scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    created_by: manager.id,
    target_external_account_id: null,
  });
  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs(50);
  const [job] = await jobsFor(contentId);
  assert.equal(job.status, "held");
  assert.equal(job.hold_reason, "MISSING_TARGET");
  assert.equal(itest.publishCalls.filter((c) => c.contentId === contentId).length, 0);
});
