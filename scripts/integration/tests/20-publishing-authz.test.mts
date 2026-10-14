/**
 * PR 2: publishing authorisation and business isolation, through the real
 * server actions / job engine with the provider adapters mocked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actAs,
  admin,
  connectAccount,
  createContent,
  jobsFor,
  makeDue,
  soon,
  membership,
  teamOrg,
} from "../helpers.ts";
import { itest } from "../state.ts";

const social = () => import("../../../src/app/(app)/app/actions/social");
const scheduler = () => import("../../../src/lib/social/scheduler");

function callsFor(contentId: string) {
  return itest.publishCalls.filter((c) => c.contentId === contentId);
}

test("publish: staff cannot publish a draft (or approved) post", async () => {
  const { orgId, staff } = await teamOrg("staffpub");
  const fb = await connectAccount(orgId, "facebook");
  const { publishContentNow, scheduleContentPublishing } = await social();

  for (const status of ["draft", "approved"]) {
    const { contentId, platformIds } = await createContent(orgId, staff.id, status);
    actAs(staff);
    const res = await publishContentNow({
      contentId,
      socialAccountId: fb,
      contentPlatformId: platformIds.facebook,
    });
    const sched = await scheduleContentPublishing({
      contentId,
      organisationId: orgId,
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    actAs(null);
    assert.ok("error" in res && res.error, `staff publish (${status}) must fail`);
    assert.ok("error" in sched && sched.error, `staff schedule (${status}) must fail`);
    assert.equal((await jobsFor(contentId)).length, 0, "no job may be created");
    assert.equal(callsFor(contentId).length, 0, "provider must not be called");
  }
});

test("publish: approval-required — managers cannot publish or schedule unapproved content", async () => {
  const { orgId, manager } = await teamOrg("approvalreq");
  await admin
    .from("organisations")
    .update({ autopilot_mode: "approval_required" })
    .eq("id", orgId);
  const fb = await connectAccount(orgId, "facebook");
  const { publishContentNow, scheduleContentPublishing } = await social();

  for (const status of ["draft", "review"]) {
    const { contentId } = await createContent(orgId, manager.id, status);
    actAs(manager);
    const res = await publishContentNow({ contentId, socialAccountId: fb });
    const sched = await scheduleContentPublishing({
      contentId,
      organisationId: orgId,
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    actAs(null);
    assert.ok("error" in res && res.error);
    assert.ok("error" in sched && sched.error);
    assert.equal((await jobsFor(contentId)).length, 0);
    const { data } = await admin.from("content").select("status").eq("id", contentId).single();
    assert.equal(data?.status, status, "status must not be changed to scheduled");
  }
});

test("publish: manager can publish approved content (happy path)", async () => {
  const { orgId, manager } = await teamOrg("happy");
  const fb = await connectAccount(orgId, "facebook", "fb-page-happy");
  const { contentId } = await createContent(orgId, manager.id, "approved");
  const { publishContentNow } = await social();
  actAs(manager);
  const res = await publishContentNow({ contentId, socialAccountId: fb });
  actAs(null);
  assert.ok("success" in res && res.success, JSON.stringify(res));
  const calls = callsFor(contentId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].externalAccountId, "fb-page-happy");
  const jobs = await jobsFor(contentId);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "published");
});

test("publish: a foreign platform-row id is rejected without leaking its post id", async () => {
  const a = await teamOrg("isoA");
  const b = await teamOrg("isoB");
  const fbA = await connectAccount(a.orgId, "facebook");
  const fbB = await connectAccount(b.orgId, "facebook");

  // Business B has a published post.
  const foreign = await createContent(b.orgId, b.owner.id, "published");
  await admin
    .from("content_platforms")
    .update({
      publish_status: "published",
      external_post_id: "SECRET-B-POST-ID",
      social_account_id: fbB,
    })
    .eq("id", foreign.platformIds.facebook);

  const own = await createContent(a.orgId, a.manager.id, "approved");
  const { publishContentNow } = await social();
  actAs(a.manager);
  const res = await publishContentNow({
    contentId: own.contentId,
    socialAccountId: fbA,
    contentPlatformId: foreign.platformIds.facebook,
  });
  actAs(null);

  assert.ok("error" in res && res.error, "must be rejected");
  assert.ok(!JSON.stringify(res).includes("SECRET-B-POST-ID"), "must not leak");
  assert.equal(callsFor(own.contentId).length, 0);
  assert.equal((await jobsFor(own.contentId)).length, 0);

  const { data: bRow } = await admin
    .from("content_platforms")
    .select("external_post_id, social_account_id, publish_status")
    .eq("id", foreign.platformIds.facebook)
    .single();
  assert.deepEqual(bRow, {
    external_post_id: "SECRET-B-POST-ID",
    social_account_id: fbB,
    publish_status: "published",
  });

  // The DB refuses the cross-business job even for the service role.
  const direct = await admin.from("social_publish_jobs").insert({
    organisation_id: a.orgId,
    content_id: own.contentId,
    content_platform_id: foreign.platformIds.facebook,
    social_account_id: fbA,
    platform: "facebook",
    scheduled_at: new Date().toISOString(),
  });
  assert.ok(direct.error);
});

test("publish: no fallback to another platform's job (account-specific error)", async () => {
  const { orgId, manager } = await teamOrg("nofallback");
  await connectAccount(orgId, "facebook");
  const ig = await connectAccount(orgId, "instagram");
  const { contentId } = await createContent(orgId, manager.id, "approved", ["facebook"]);
  const { publishContentNow } = await social();
  actAs(manager);
  const res = await publishContentNow({ contentId, socialAccountId: ig });
  actAs(null);
  assert.ok("error" in res && res.error);
  assert.match(String((res as { error: string }).error), /instagram/i);
  assert.equal(callsFor(contentId).length, 0);
  assert.equal((await jobsFor(contentId)).length, 0, "facebook job must not be created either");
});

test("publish: revoked membership — cron holds the job instead of publishing", async () => {
  const { orgId, owner, manager } = await teamOrg("revoked");
  await admin
    .from("automation_settings")
    .upsert({ organisation_id: orgId, mode: "approval", enabled: true });
  await connectAccount(orgId, "facebook");
  const { contentId } = await createContent(orgId, manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(manager);
  const sched = await scheduleContentPublishing({
    contentId,
    organisationId: orgId,
    scheduledAt: soon(),
  });
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));
  await makeDue(contentId);

  // Owner removes the manager who queued the post.
  const { removeTeamMember } = await import(
    "../../../src/app/(app)/app/actions/onboarding"
  );
  actAs(owner);
  const mgr = await membership(orgId, manager.id);
  const rm = await removeTeamMember({ organisationId: orgId, membershipId: mgr!.id });
  actAs(null);
  assert.deepEqual(rm, { success: true });

  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs(50);

  const [job] = await jobsFor(contentId);
  assert.equal(job.status, "held");
  assert.equal(job.hold_reason, "ACTOR_NOT_AUTHORISED");
  assert.equal(callsFor(contentId).length, 0);
});

test("publish: content moved back to review — cron holds the job", async () => {
  const { orgId, manager } = await teamOrg("unapproved");
  await admin
    .from("automation_settings")
    .upsert({ organisation_id: orgId, mode: "approval", enabled: true });
  await connectAccount(orgId, "facebook");
  const { contentId } = await createContent(orgId, manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(manager);
  const sched = await scheduleContentPublishing({
    contentId,
    organisationId: orgId,
    scheduledAt: soon(),
  });
  actAs(null);
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));
  await makeDue(contentId);
  await admin.from("content").update({ status: "review" }).eq("id", contentId);

  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs(50);
  const [job] = await jobsFor(contentId);
  assert.equal(job.status, "held");
  assert.equal(job.hold_reason, "CONTENT_NOT_APPROVED");
  assert.equal(callsFor(contentId).length, 0);
});

test("publish: retryPublishJob refuses staff and re-checks content state", async () => {
  const { orgId, staff, manager } = await teamOrg("retry");
  const fb = await connectAccount(orgId, "facebook");
  const { contentId, platformIds } = await createContent(orgId, manager.id, "failed");
  const { data: job } = await admin
    .from("social_publish_jobs")
    .insert({
      organisation_id: orgId,
      content_id: contentId,
      content_platform_id: platformIds.facebook,
      social_account_id: fb,
      platform: "facebook",
      status: "failed",
      scheduled_at: new Date().toISOString(),
      created_by: manager.id,
    })
    .select("id")
    .single();
  const { retryPublishJob } = await scheduler();
  const byStaff = await retryPublishJob({ jobId: job!.id, organisationId: orgId, userId: staff.id });
  assert.ok("error" in byStaff && byStaff.error);
  assert.equal(callsFor(contentId).length, 0);

  await admin.from("content").update({ status: "draft" }).eq("id", contentId);
  const draft = await retryPublishJob({ jobId: job!.id, organisationId: orgId, userId: manager.id });
  assert.ok("error" in draft && draft.error);
  assert.equal(callsFor(contentId).length, 0);
});

test("publish: content studio surfaces a failed schedule instead of reporting success", async () => {
  const { orgId, manager } = await teamOrg("studiosched");
  // No connected accounts → scheduling cannot queue anything.
  const { saveContentPackage } = await import(
    "../../../src/app/(app)/app/actions/content-studio"
  );
  actAs(manager);
  const res = await saveContentPackage({
    organisation_id: orgId,
    title: "Studio post",
    caption: "Hello",
    platforms: ["facebook"],
    status: "scheduled",
    scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  actAs(null);
  assert.ok("error" in res && res.error, JSON.stringify(res));
  const id = (res as { id?: string }).id!;
  const { data } = await admin.from("content").select("status").eq("id", id).single();
  assert.equal(data?.status, "approved", "must not be left looking scheduled");
  assert.equal((await jobsFor(id)).length, 0);
});

test("publish: approveContent with no matching account does not leave content scheduled", async () => {
  const { orgId, manager } = await teamOrg("approvenoacct");
  const { contentId } = await createContent(orgId, manager.id, "review");
  const { approveContent } = await import("../../../src/app/(app)/app/actions/automation");
  actAs(manager);
  const res = await approveContent({ organisationId: orgId, contentId });
  actAs(null);
  assert.ok("error" in res && res.error);
  const { data } = await admin.from("content").select("status").eq("id", contentId).single();
  assert.equal(data?.status, "approved");
});
