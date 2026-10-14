/**
 * Stage-2 review fixes: uncertain jobs, explicit "not live" retry, diff-only
 * autosave, cancellation coverage, content creation, cron cap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actAs,
  admin,
  connectAccount,
  createContent,
  createOrg,
  createUser,
  jobsFor,
  makeDue,
  soon,
  teamOrg,
} from "../helpers.ts";
import { itest } from "../state.ts";

const social = () => import("../../../src/app/(app)/app/actions/social");
const studio = () => import("../../../src/app/(app)/app/actions/content-studio");
const automation = () => import("../../../src/app/(app)/app/actions/automation");
const publishing = () => import("../../../src/app/(app)/app/actions/publishing");
const scheduler = () => import("../../../src/lib/social/scheduler");

const callsFor = (contentId: string) =>
  itest.publishCalls.filter((c) => c.contentId === contentId).length;

async function contentRow(contentId: string) {
  const { data, error } = await admin
    .from("content")
    .select("status, scheduled_at")
    .eq("id", contentId)
    .single();
  if (error) throw error;
  return data;
}

/** Approved post with one Facebook job left `uncertain` (may be live). */
async function uncertainPost(label: string) {
  const team = await teamOrg(label);
  const fb = await connectAccount(team.orgId, "facebook", `page-${label}`);
  const { contentId, platformIds } = await createContent(team.orgId, team.manager.id, "approved");
  const { data: job, error } = await admin
    .from("social_publish_jobs")
    .insert({
      organisation_id: team.orgId,
      content_id: contentId,
      content_platform_id: platformIds.facebook,
      social_account_id: fb,
      platform: "facebook",
      status: "uncertain",
      hold_reason: "UNCERTAIN_OUTCOME",
      error_code: "UNCERTAIN_OUTCOME",
      error_message: "Worker stopped after sending",
      scheduled_at: new Date(Date.now() - 600_000).toISOString(),
      request_sent_at: new Date(Date.now() - 590_000).toISOString(),
      created_by: team.manager.id,
      target_external_account_id: `page-${label}`,
    })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return { ...team, fb, contentId, platformIds, jobId: job!.id as string };
}

// ---------------------------------------------------------------- A1

test("A1: an uncertain job blocks reschedule, re-approve and Publish now", async () => {
  const p = await uncertainPost("unc-block");
  const { scheduleContentPublishing, publishContentNow } = await social();
  const { approveContent } = await automation();
  actAs(p.manager);
  const sched = await scheduleContentPublishing({
    contentId: p.contentId,
    organisationId: p.orgId,
    scheduledAt: soon(),
  });
  const approve = await approveContent({ organisationId: p.orgId, contentId: p.contentId });
  const now = await publishContentNow({ contentId: p.contentId, socialAccountId: p.fb });
  actAs(null);

  assert.equal((sched as { code?: string }).code, "UNCERTAIN_PENDING", JSON.stringify(sched));
  assert.match(String((approve as { error?: string }).error), /may already be live/);
  assert.equal((now as { code?: string }).code, "UNCERTAIN_PENDING", JSON.stringify(now));
  assert.equal(callsFor(p.contentId), 0);
  const jobs = await jobsFor(p.contentId);
  assert.deepEqual(jobs.map((j) => j.status), ["uncertain"]);
  assert.equal((await contentRow(p.contentId)).status, "approved");
});

test("A1: other platforms still queue; the database refuses a second active job", async () => {
  const p = await uncertainPost("unc-other");
  await connectAccount(p.orgId, "instagram", "ig-unc-other");
  await admin.from("content_platforms").insert({ content_id: p.contentId, platform: "instagram" });
  const { scheduleContentPublishing } = await social();
  actAs(p.manager);
  const sched = await scheduleContentPublishing({
    contentId: p.contentId,
    organisationId: p.orgId,
    scheduledAt: soon(),
  });
  actAs(null);
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));
  assert.deepEqual(
    sched.platforms.map((x) => [x.platform, x.status]).sort(),
    [
      ["facebook", "uncertain_pending"],
      ["instagram", "queued"],
    ]
  );
  assert.match(String(sched.warning), /may already be live/);

  // Backstop for any writer: uncertain counts in the active-job index.
  const dup = await admin.from("social_publish_jobs").insert({
    organisation_id: p.orgId,
    content_id: p.contentId,
    content_platform_id: p.platformIds.facebook,
    social_account_id: p.fb,
    platform: "facebook",
    status: "pending",
    scheduled_at: soon(),
    created_by: p.manager.id,
    target_external_account_id: "page-unc-other",
  });
  assert.equal(dup.error?.code, "23505", JSON.stringify(dup.error));
});

// ---------------------------------------------------------------- A2

test("A2: retrying an uncertain job needs an explicit 'not live' confirmation", async () => {
  const p = await uncertainPost("unc-retry");
  const { retryFailedPublishJob } = await publishing();
  actAs(p.manager);
  const refused = await retryFailedPublishJob({ organisationId: p.orgId, jobId: p.jobId });
  actAs(null);
  assert.ok("error" in refused && refused.error, JSON.stringify(refused));
  assert.equal((refused as { needsConfirmation?: boolean }).needsConfirmation, true);
  assert.equal(callsFor(p.contentId), 0);
  assert.equal((await jobsFor(p.contentId))[0].status, "uncertain");

  actAs(p.manager);
  const ok = await retryFailedPublishJob({
    organisationId: p.orgId,
    jobId: p.jobId,
    confirmNotLive: true,
  });
  actAs(null);
  assert.ok("success" in ok && ok.success, JSON.stringify(ok));
  assert.equal(callsFor(p.contentId), 1);
  assert.equal((await jobsFor(p.contentId))[0].status, "published");
  const { data: audit } = await admin
    .from("audit_logs")
    .select("action, user_id, entity_id")
    .eq("organisation_id", p.orgId)
    .eq("action", "publish_job.retry_uncertain_confirmed_not_live");
  assert.deepEqual(audit, [
    {
      action: "publish_job.retry_uncertain_confirmed_not_live",
      user_id: p.manager.id,
      entity_id: p.jobId,
    },
  ]);
});

// ---------------------------------------------------------------- A3

test("A3: an alt-text autosave on approved content with #hashtags keeps approval", async () => {
  const team = await teamOrg("hashtags");
  await connectAccount(team.orgId, "facebook");
  const { contentId } = await createContent(team.orgId, team.manager.id, "draft");
  // Stored with "#" (as AI drafts often are), then approved.
  await admin
    .from("content")
    .update({ hashtags: ["#fyp", "#salon", " #Hair "], status: "approved" })
    .eq("id", contentId);
  const { scheduleContentPublishing } = await social();
  actAs(team.manager);
  const sched = await scheduleContentPublishing({
    contentId,
    organisationId: team.orgId,
    scheduledAt: soon(),
  });
  actAs(null);
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));

  // Exactly what the editor does: diff against the loaded snapshot.
  const { data: row } = await admin.from("content").select("*").eq("id", contentId).single();
  const { editorFieldsFrom, changedFields } = await import(
    "../../../src/lib/content/editor-fields.ts"
  );
  const loaded = editorFieldsFrom(row);
  const edited = { ...loaded, alt_text: "Stylist finishing a blow-dry" };
  const payload = changedFields(loaded, edited);
  assert.deepEqual(payload, { alt_text: "Stylist finishing a blow-dry" });

  const { updateContentFields } = await studio();
  actAs(team.manager);
  const res = await updateContentFields({
    contentId,
    organisationId: team.orgId,
    silent: true,
    fields: payload,
  });
  actAs(null);
  assert.ok(res.success, JSON.stringify(res));
  assert.equal(res.movedToReview, false);
  assert.equal((await contentRow(contentId)).status, "scheduled");
  assert.deepEqual((await jobsFor(contentId)).map((j) => j.status), ["pending"]);

  // Re-saving the hashtags in normalised form is not a material change either.
  const r = await team.manager.client
    .from("content")
    .update({ hashtags: ["fyp", "salon", "Hair"] })
    .eq("id", contentId)
    .select("status");
  assert.equal(r.data?.[0]?.status, "scheduled");
});

// ---------------------------------------------------------------- B (PR 3)

test("B: an ambiguous network timeout ends up uncertain, not failed", async () => {
  const team = await teamOrg("timeout");
  const fb = await connectAccount(team.orgId, "facebook");
  const { contentId } = await createContent(team.orgId, team.manager.id, "approved");
  const { publishContentNow } = await social();
  itest.publishError = "fetch failed: ETIMEDOUT";
  actAs(team.manager);
  const res = await publishContentNow({ contentId, socialAccountId: fb });
  actAs(null);
  itest.publishError = null;
  assert.ok("error" in res && res.error, JSON.stringify(res));
  const jobs = await jobsFor(contentId);
  assert.deepEqual(jobs.map((j) => [j.status, j.hold_reason]), [["uncertain", "UNCERTAIN_OUTCOME"]]);

  // The control centre lists it under "needs attention".
  const { getNeedsAttention } = await import("../../../src/lib/automation/control");
  const items = await getNeedsAttention(admin as never, team.orgId);
  assert.ok(
    items.some((i: { id: string }) => i.id === `ambiguous-${jobs[0].id}`),
    JSON.stringify(items)
  );
});

test("B: emergency stop and reject cancel ready / retrying / held jobs too", async () => {
  const team = await teamOrg("stopall");
  await connectAccount(team.orgId, "facebook");
  await connectAccount(team.orgId, "instagram");
  const a = await createContent(team.orgId, team.manager.id, "approved", ["facebook", "instagram"]);
  const b = await createContent(team.orgId, team.manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(team.manager);
  for (const c of [a, b]) {
    const s = await scheduleContentPublishing({
      contentId: c.contentId,
      organisationId: team.orgId,
      scheduledAt: soon(),
    });
    assert.ok("success" in s && s.success, JSON.stringify(s));
  }
  actAs(null);
  const [fbJob, igJob] = (await jobsFor(a.contentId)).sort((x, y) =>
    String(x.platform).localeCompare(String(y.platform))
  );
  await admin.from("social_publish_jobs").update({ status: "ready" }).eq("id", fbJob.id);
  await admin.from("social_publish_jobs").update({ status: "retrying" }).eq("id", igJob.id);

  const { rejectContent, emergencyStopAutomation } = await automation();
  actAs(team.manager);
  const rej = await rejectContent({ organisationId: team.orgId, contentId: a.contentId });
  actAs(null);
  assert.ok("success" in rej && rej.success, JSON.stringify(rej));
  assert.deepEqual((await jobsFor(a.contentId)).map((j) => j.status), ["cancelled", "cancelled"]);

  await admin
    .from("social_publish_jobs")
    .update({ status: "held", hold_reason: "ACTOR_NOT_AUTHORISED" })
    .eq("content_id", b.contentId);
  actAs(team.manager);
  const stop = await emergencyStopAutomation(team.orgId);
  actAs(null);
  assert.ok(!("error" in stop && stop.error), JSON.stringify(stop));
  assert.deepEqual((await jobsFor(b.contentId)).map((j) => j.status), ["cancelled"]);
});

// ---------------------------------------------------------------- B (PR 4)

test("B: new content cannot be created already scheduled or published", async () => {
  const team = await teamOrg("createstatus");
  const { saveGeneratedContent } = await import("../../../src/app/(app)/app/actions/org");
  actAs(team.manager);
  const published = await saveGeneratedContent({
    organisation_id: team.orgId,
    title: "x",
    status: "published",
  });
  const scheduled = await saveGeneratedContent({
    organisation_id: team.orgId,
    title: "y",
    status: "scheduled",
    platforms: ["facebook"],
  });
  actAs(null);
  assert.ok("error" in published && published.error, JSON.stringify(published));
  // No connected account: saved as approved, scheduling reported as failed.
  assert.match(String((scheduled as { error?: string }).error), /Saved as approved/);
  const id = (scheduled as { id: string }).id;
  assert.equal((await contentRow(id)).status, "approved");

  const direct = await team.manager.client
    .from("content")
    .insert({ organisation_id: team.orgId, title: "z", status: "scheduled" });
  assert.equal(direct.error?.code, "42501", JSON.stringify(direct.error));
});

test("B: Publish now for one platform keeps the post's later scheduled time", async () => {
  const team = await teamOrg("pubone");
  const fb = await connectAccount(team.orgId, "facebook");
  await connectAccount(team.orgId, "instagram");
  const { contentId } = await createContent(team.orgId, team.manager.id, "approved", [
    "facebook",
    "instagram",
  ]);
  const later = new Date(Date.now() + 6 * 3600_000).toISOString();
  const { scheduleContentPublishing, publishContentNow } = await social();
  actAs(team.manager);
  const s = await scheduleContentPublishing({ contentId, organisationId: team.orgId, scheduledAt: later });
  assert.ok("success" in s && s.success, JSON.stringify(s));
  // Drop the facebook job so Publish now has to create one via the RPC.
  await admin
    .from("social_publish_jobs")
    .update({ status: "cancelled" })
    .eq("content_id", contentId)
    .eq("platform", "facebook");
  const now = await publishContentNow({ contentId, socialAccountId: fb });
  actAs(null);
  assert.ok("success" in now && now.success, JSON.stringify(now));
  const row = await contentRow(contentId);
  assert.equal(new Date(row.scheduled_at!).toISOString(), later);
});

test("B: one cron call claims at most the cap; the rest stay due", async () => {
  const owner = await createUser("cap-owner");
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push(await createOrg(owner, `cap-${i}`));
  const old = new Date(Date.now() - 10 * 3600_000).toISOString();
  const { error } = await admin.from("automation_settings").insert(
    ids.map((organisation_id) => ({
      organisation_id,
      enabled: true,
      paused: false,
      mode: "approval",
      last_run_at: old,
    }))
  );
  assert.equal(error, null, error?.message);
  const { claimDueAutomation } = await import("../../../src/lib/automation/engine");
  const { createAdminClient } = await import("../../../src/lib/supabase/admin");
  // Other businesses in the shared test DB may be due too: keep calling and
  // check that no call takes more than the cap and every one of ours is
  // claimed exactly once along the way.
  const seen: string[] = [];
  for (let i = 0; i < 50 && ids.some((id) => !seen.includes(id)); i++) {
    const r = await claimDueAutomation(createAdminClient(), new Date(), 2);
    assert.ok(r.claimed.length <= 2, JSON.stringify(r));
    if (!r.claimed.length) break;
    seen.push(...r.claimed);
  }
  assert.deepEqual(
    ids.map((id) => seen.filter((s) => s === id).length),
    [1, 1, 1],
    JSON.stringify(seen)
  );
});

// ---------------------------------------------------------------- B (PR 6)

test("B: moving a post out of approved holds its queued jobs (calendar stays honest)", async () => {
  const team = await teamOrg("revert");
  await connectAccount(team.orgId, "facebook");
  const { contentId, platformIds } = await createContent(team.orgId, team.manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(team.manager);
  await scheduleContentPublishing({ contentId, organisationId: team.orgId, scheduledAt: soon() });
  const { updateContentStatus } = await import("../../../src/app/(app)/app/actions/org");
  const res = await updateContentStatus(contentId, "draft");
  actAs(null);
  assert.ok(!("error" in res && res.error), JSON.stringify(res));
  assert.deepEqual(
    (await jobsFor(contentId)).map((j) => [j.status, j.hold_reason]),
    [["held", "CONTENT_NOT_APPROVED"]]
  );
  const { data: cp } = await admin
    .from("content_platforms")
    .select("publish_status")
    .eq("id", platformIds.facebook)
    .single();
  assert.equal(cp?.publish_status, "held");
  await makeDue(contentId);
  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs();
  assert.equal(callsFor(contentId), 0);
});
