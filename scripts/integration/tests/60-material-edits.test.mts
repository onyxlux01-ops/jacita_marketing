/**
 * PR 6: editor saves. Material edits invalidate approval; the editor cannot
 * move the schedule (that goes through schedule_content).
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
  teamOrg,
} from "../helpers.ts";
import { itest } from "../state.ts";

const studio = () => import("../../../src/app/(app)/app/actions/content-studio");
const social = () => import("../../../src/app/(app)/app/actions/social");
const automation = () => import("../../../src/app/(app)/app/actions/automation");
const scheduler = () => import("../../../src/lib/social/scheduler");

async function scheduledPost(label: string) {
  const team = await teamOrg(label);
  await connectAccount(team.orgId, "facebook");
  const { contentId, platformIds } = await createContent(team.orgId, team.manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(team.manager);
  const sched = await scheduleContentPublishing({
    contentId,
    organisationId: team.orgId,
    scheduledAt: soon(),
  });
  actAs(null);
  assert.ok("success" in sched && sched.success, JSON.stringify(sched));
  return { ...team, contentId, platformIds };
}

async function contentRow(contentId: string) {
  const { data, error } = await admin
    .from("content")
    .select("status, caption, scheduled_at")
    .eq("id", contentId)
    .single();
  if (error) throw error;
  return data;
}

test("edit: a caption edit on scheduled content sends it to review and holds its jobs", async () => {
  const p = await scheduledPost("matedit");
  const { updateContentFields } = await studio();
  actAs(p.manager);
  const res = await updateContentFields({
    contentId: p.contentId,
    organisationId: p.orgId,
    silent: true,
    fields: { caption: "A different offer: 20% off" },
  });
  actAs(null);
  assert.ok(res.success, JSON.stringify(res));
  assert.equal(res.movedToReview, true);
  assert.equal(res.status, "review");
  assert.equal((await contentRow(p.contentId)).status, "review");

  const jobs = await jobsFor(p.contentId);
  assert.deepEqual(
    jobs.map((j) => [j.status, j.hold_reason]),
    [["held", "CONTENT_CHANGED"]]
  );
  const { data: cp } = await admin
    .from("content_platforms")
    .select("publish_status")
    .eq("id", p.platformIds.facebook)
    .single();
  assert.equal(cp?.publish_status, "held");

  // The cron never publishes it, even once its time has passed.
  await admin
    .from("social_publish_jobs")
    .update({ scheduled_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("content_id", p.contentId);
  const { processDuePublishJobs } = await scheduler();
  await processDuePublishJobs();
  assert.equal(itest.publishCalls.filter((c) => c.contentId === p.contentId).length, 0);

  // Re-approval re-queues the edited version (the held job is replaced).
  const { approveContent } = await automation();
  actAs(p.manager);
  const again = await approveContent({ organisationId: p.orgId, contentId: p.contentId });
  actAs(null);
  assert.ok("success" in again && again.success, JSON.stringify(again));
  assert.equal((await contentRow(p.contentId)).status, "scheduled");
  const after = await jobsFor(p.contentId);
  assert.deepEqual(after.map((j) => j.status).sort(), ["cancelled", "pending"]);
});

test("edit: a media or product (offer/price) change also invalidates approval", async () => {
  const p = await scheduledPost("matmedia");
  const { data: svc, error } = await admin
    .from("products_services")
    .insert({ organisation_id: p.orgId, name: "Cut and finish", price: 45 })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  const r = await p.manager.client
    .from("content")
    .update({ product_service_id: svc!.id })
    .eq("id", p.contentId)
    .select("status");
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.data?.[0]?.status, "review");
  assert.equal((await jobsFor(p.contentId))[0].status, "held");
});

test("edit: non-material fields keep the approval and the queued job", async () => {
  const p = await scheduledPost("nonmat");
  const { updateContentFields } = await studio();
  actAs(p.manager);
  const res = await updateContentFields({
    contentId: p.contentId,
    organisationId: p.orgId,
    fields: { voiceover_script: "Internal note for the shoot", posting_recommendation: "Lunchtime" },
  });
  actAs(null);
  assert.ok(res.success, JSON.stringify(res));
  assert.equal(res.movedToReview, false);
  assert.equal((await contentRow(p.contentId)).status, "scheduled");
  assert.equal((await jobsFor(p.contentId))[0].status, "pending");
});

test("edit: the editor cannot move the schedule; the Data API cannot keep approval while editing", async () => {
  const p = await scheduledPost("noschedule");
  const before = await contentRow(p.contentId);
  const jobsBefore = await jobsFor(p.contentId);
  const { updateContentFields } = await studio();
  actAs(p.manager);
  const res = await updateContentFields({
    contentId: p.contentId,
    organisationId: p.orgId,
    // Not in the type any more; a stale client could still send it.
    fields: { scheduled_at: new Date(Date.now() + 86_400_000).toISOString() } as never,
  });
  actAs(null);
  assert.ok(res.error, JSON.stringify(res));
  assert.deepEqual(await contentRow(p.contentId), before);
  assert.deepEqual(await jobsFor(p.contentId), jobsBefore);

  // A manager writing caption + status "scheduled" in one update still lands
  // in review with the job held.
  const direct = await p.manager.client
    .from("content")
    .update({ caption: "Sneaky edit", status: "scheduled" })
    .eq("id", p.contentId)
    .select("status");
  assert.equal(direct.error, null, direct.error?.message);
  assert.equal(direct.data?.[0]?.status, "review");
  assert.equal((await jobsFor(p.contentId))[0].status, "held");
});

test("edit: a per-platform caption override edit invalidates approval too", async () => {
  const p = await scheduledPost("override");
  await makeDue(p.contentId);
  const { error } = await admin
    .from("content_platforms")
    .update({ caption_override: "Facebook-only wording" })
    .eq("id", p.platformIds.facebook);
  assert.equal(error, null, error?.message);
  assert.equal((await contentRow(p.contentId)).status, "review");
  const { data: cp } = await admin
    .from("content_platforms")
    .select("publish_status")
    .eq("id", p.platformIds.facebook)
    .single();
  assert.equal(cp?.publish_status, "held");
  assert.equal((await jobsFor(p.contentId))[0].status, "held");
});

test("edit: staff still cannot edit approved content", async () => {
  const p = await scheduledPost("staffedit");
  const { updateContentFields } = await studio();
  actAs(p.staff);
  const res = await updateContentFields({
    contentId: p.contentId,
    organisationId: p.orgId,
    fields: { caption: "staff change" },
  });
  actAs(null);
  assert.ok(res.error, JSON.stringify(res));
  assert.equal((await contentRow(p.contentId)).status, "scheduled");
  assert.equal((await jobsFor(p.contentId))[0].status, "pending");
});
