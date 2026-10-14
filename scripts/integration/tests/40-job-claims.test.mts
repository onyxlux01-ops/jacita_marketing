/**
 * PR 3: atomic job claims, lock-token-matched writes and crash recovery.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actAs,
  admin,
  connectAccount,
  createContent,
  jobsFor,
  teamOrg,
} from "../helpers.ts";
import { itest } from "../state.ts";

const social = () => import("../../../src/app/(app)/app/actions/social");
const scheduler = () => import("../../../src/lib/social/scheduler");

const callsFor = (contentId: string) =>
  itest.publishCalls.filter((c) => c.contentId === contentId).length;

async function approvedPost(label: string) {
  const team = await teamOrg(label);
  await admin
    .from("automation_settings")
    .upsert({ organisation_id: team.orgId, mode: "approval", enabled: true });
  const fb = await connectAccount(team.orgId, "facebook", `page-${label}`);
  const post = await createContent(team.orgId, team.manager.id, "approved");
  return { ...team, fb, ...post };
}

test("claims: two concurrent Publish now calls publish exactly once", async () => {
  const p = await approvedPost("dblpub");
  const { publishContentNow } = await social();
  itest.publishDelayMs = 400;
  actAs(p.manager);
  const [a, b] = await Promise.all([
    publishContentNow({ contentId: p.contentId, socialAccountId: p.fb }),
    publishContentNow({ contentId: p.contentId, socialAccountId: p.fb }),
  ]);
  actAs(null);
  itest.publishDelayMs = 0;
  assert.equal(callsFor(p.contentId), 1, JSON.stringify([a, b]));
  const winners = [a, b].filter((r) => "success" in r && r.success && !("duplicate" in r && r.duplicate));
  assert.equal(winners.length, 1, JSON.stringify([a, b]));
  const jobs = await jobsFor(p.contentId);
  assert.equal(jobs.filter((j) => j.status === "published").length, 1);
});

test("claims: a manual publish overlapping cron publishes once", async () => {
  const p = await approvedPost("overlap");
  const { scheduleContentPublishing, publishContentNow } = await social();
  actAs(p.manager);
  const sched = await scheduleContentPublishing({
    contentId: p.contentId,
    organisationId: p.orgId,
    scheduledAt: new Date(Date.now() - 30_000).toISOString(),
  });
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));
  const { processDuePublishJobs } = await scheduler();
  itest.publishDelayMs = 400;
  const [cron, manual] = await Promise.all([
    processDuePublishJobs(50),
    publishContentNow({ contentId: p.contentId, socialAccountId: p.fb }),
  ]);
  actAs(null);
  itest.publishDelayMs = 0;
  assert.equal(callsFor(p.contentId), 1, JSON.stringify({ manual }));
  void cron;
  const jobs = await jobsFor(p.contentId);
  assert.equal(jobs.filter((j) => j.status === "published").length, 1);
  assert.equal(jobs.filter((j) => j.status === "processing").length, 0);
});

test("claims: Publish now never resets a processing job", async () => {
  const p = await approvedPost("noreset");
  await admin.from("social_publish_jobs").insert({
    organisation_id: p.orgId,
    content_id: p.contentId,
    content_platform_id: p.platformIds.facebook,
    social_account_id: p.fb,
    platform: "facebook",
    status: "processing",
    scheduled_at: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    lock_token: "live-worker-token-0001",
    created_by: p.manager.id,
    target_external_account_id: "page-noreset",
  });
  const { publishContentNow } = await social();
  actAs(p.manager);
  const res = await publishContentNow({ contentId: p.contentId, socialAccountId: p.fb });
  actAs(null);
  assert.ok("inProgress" in res && res.inProgress, JSON.stringify(res));
  const [job] = await jobsFor(p.contentId);
  assert.equal(job.status, "processing");
  assert.equal(job.lock_token, "live-worker-token-0001");
  assert.equal(callsFor(p.contentId), 0);

  const { retryPublishJob } = await scheduler();
  const retry = await retryPublishJob({
    jobId: job.id as string,
    organisationId: p.orgId,
    userId: p.manager.id,
  });
  assert.ok("inProgress" in retry && retry.inProgress);
  const [after] = await jobsFor(p.contentId);
  assert.equal(after.lock_token, "live-worker-token-0001");
});

async function staleProcessingJob(label: string, requestSent: boolean) {
  const p = await approvedPost(label);
  await admin.from("content").update({ status: "scheduled" }).eq("id", p.contentId);
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data } = await admin
    .from("social_publish_jobs")
    .insert({
      organisation_id: p.orgId,
      content_id: p.contentId,
      content_platform_id: p.platformIds.facebook,
      social_account_id: p.fb,
      platform: "facebook",
      status: "processing",
      scheduled_at: old,
      locked_at: old,
      lock_token: "dead-worker-token-0001",
      attempt_count: 1,
      created_by: p.manager.id,
      target_external_account_id: `page-${label}`,
      request_sent_at: requestSent ? old : null,
    })
    .select("id")
    .single();
  return { ...p, jobId: data!.id as string };
}

test("recovery: stale lock AFTER the request was sent → uncertain, not retried", async () => {
  const p = await staleProcessingJob("uncertain", true);
  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs(50);
  const [job] = await jobsFor(p.contentId);
  assert.equal(job.status, "uncertain");
  assert.equal(job.hold_reason, "UNCERTAIN_OUTCOME");
  assert.equal(job.lock_token, null);
  assert.equal(callsFor(p.contentId), 0, "must never be re-sent automatically");

  // A second cron pass leaves it alone.
  await processDuePublishJobs(50);
  assert.equal(callsFor(p.contentId), 0);
  assert.equal((await jobsFor(p.contentId))[0].status, "uncertain");
});

test("recovery: stale lock BEFORE the request was sent → safe retry", async () => {
  const p = await staleProcessingJob("safe", false);
  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs(50);
  const [job] = await jobsFor(p.contentId);
  assert.equal(job.status, "published", JSON.stringify(job));
  assert.equal(callsFor(p.contentId), 1);
  assert.ok(job.request_sent_at, "marker recorded before the provider call");
});

test("disconnect: processing jobs are left alone, queued ones cancelled", async () => {
  const p = await approvedPost("disc");
  const queued = await createContent(p.orgId, p.manager.id, "scheduled");
  await admin.from("social_publish_jobs").insert([
    {
      organisation_id: p.orgId,
      content_id: p.contentId,
      content_platform_id: p.platformIds.facebook,
      social_account_id: p.fb,
      platform: "facebook",
      status: "processing",
      scheduled_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      lock_token: "live-worker-token-0002",
      created_by: p.manager.id,
      target_external_account_id: "page-disc",
    },
    {
      organisation_id: p.orgId,
      content_id: queued.contentId,
      content_platform_id: queued.platformIds.facebook,
      social_account_id: p.fb,
      platform: "facebook",
      status: "pending",
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      created_by: p.manager.id,
      target_external_account_id: "page-disc",
    },
  ]);
  const { disconnectSocialAccount } = await social();
  actAs(p.manager);
  const res = await disconnectSocialAccount({ organisationId: p.orgId, platform: "facebook" });
  actAs(null);
  assert.deepEqual(res, { success: true });
  assert.equal((await jobsFor(p.contentId))[0].status, "processing");
  assert.equal((await jobsFor(queued.contentId))[0].status, "cancelled");
});

test("claims: browser sessions can no longer write publish jobs", async () => {
  const p = await approvedPost("nowrite");
  const ins = await p.manager.client.from("social_publish_jobs").insert({
    organisation_id: p.orgId,
    content_id: p.contentId,
    social_account_id: p.fb,
    platform: "facebook",
    scheduled_at: new Date().toISOString(),
  });
  assert.ok(ins.error, "manager insert must be refused");
  const rpc = await p.manager.client.rpc("claim_publish_job", {
    p_job_id: "00000000-0000-0000-0000-000000000000",
    p_lock_token: "x".repeat(32),
    p_allowed_states: ["pending"],
  });
  assert.ok(rpc.error, "claim RPC is service-role only");
});
