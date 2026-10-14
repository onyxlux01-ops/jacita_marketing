/**
 * PR 4: transactional scheduling through the schedule_content RPC.
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

const social = () => import("../../../src/app/(app)/app/actions/social");
const future = () => new Date(Date.now() + 3600_000).toISOString();

test("schedule: no matching accounts changes nothing", async () => {
  const { orgId, manager } = await teamOrg("sched-none");
  const { contentId } = await createContent(orgId, manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(manager);
  const res = await scheduleContentPublishing({ contentId, organisationId: orgId, scheduledAt: future() });
  actAs(null);
  assert.ok("error" in res && res.error);
  assert.equal((await jobsFor(contentId)).length, 0);
  const { data } = await admin.from("content").select("status, scheduled_at").eq("id", contentId).single();
  assert.deepEqual(data, { status: "approved", scheduled_at: null });
});

test("schedule: an insert failure keeps the existing jobs", async () => {
  const { orgId, manager } = await teamOrg("sched-keep");
  const fb = await connectAccount(orgId, "facebook", "page-keep");
  const ig = await connectAccount(orgId, "instagram", "ig-keep");
  const { contentId, platformIds } = await createContent(orgId, manager.id, "scheduled", [
    "facebook",
    "instagram",
  ]);
  await admin.from("social_publish_jobs").insert([
    {
      organisation_id: orgId,
      content_id: contentId,
      content_platform_id: platformIds.facebook,
      social_account_id: fb,
      platform: "facebook",
      status: "pending",
      scheduled_at: future(),
      created_by: manager.id,
      target_external_account_id: "page-keep",
    },
    {
      organisation_id: orgId,
      content_id: contentId,
      content_platform_id: platformIds.instagram,
      social_account_id: ig,
      platform: "instagram",
      status: "processing",
      scheduled_at: new Date().toISOString(),
      lock_token: "live-worker-token-0003",
      locked_at: new Date().toISOString(),
      created_by: manager.id,
      target_external_account_id: "ig-keep",
    },
  ]);
  const { scheduleContentPublishing } = await social();
  actAs(manager);
  const res = await scheduleContentPublishing({ contentId, organisationId: orgId, scheduledAt: future() });
  actAs(null);
  assert.ok("error" in res && res.error, JSON.stringify(res));
  const jobs = await jobsFor(contentId);
  assert.deepEqual(
    jobs.map((j) => [j.platform, j.status]).sort(),
    [
      ["facebook", "pending"],
      ["instagram", "processing"],
    ]
  );
});

test("schedule: concurrent scheduling never creates duplicate active jobs", async () => {
  const { orgId, manager } = await teamOrg("sched-race");
  await connectAccount(orgId, "facebook", "page-race");
  const { contentId } = await createContent(orgId, manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(manager);
  const results = await Promise.all(
    [1, 2, 3, 4].map((i) =>
      scheduleContentPublishing({
        contentId,
        organisationId: orgId,
        scheduledAt: new Date(Date.now() + i * 3600_000).toISOString(),
      })
    )
  );
  actAs(null);
  assert.ok(results.every((r) => "success" in r && r.success), JSON.stringify(results));
  const jobs = await jobsFor(contentId);
  const active = jobs.filter((j) =>
    ["pending", "ready", "processing", "retrying"].includes(String(j.status))
  );
  assert.equal(active.length, 1);
  assert.equal(jobs.length, 4);
});

test("schedule: malformed and past timestamps are rejected", async () => {
  const { orgId, manager } = await teamOrg("sched-time");
  await connectAccount(orgId, "facebook", "page-time");
  const { contentId } = await createContent(orgId, manager.id, "approved");
  const { scheduleContentPublishing } = await social();
  actAs(manager);
  const bad = await scheduleContentPublishing({ contentId, organisationId: orgId, scheduledAt: "tomorrow-ish" });
  const past = await scheduleContentPublishing({
    contentId,
    organisationId: orgId,
    scheduledAt: new Date(Date.now() - 3600_000).toISOString(),
  });
  actAs(null);
  assert.ok("error" in bad && bad.error);
  assert.ok("error" in past && past.error);
  assert.match(String((past as { error: string }).error), /past/);
  assert.equal((await jobsFor(contentId)).length, 0);
});

test("automation cron: overdue businesses are caught up once; overlapping triggers never double-claim", async () => {
  const { createOrg, createUser } = await import("../helpers.ts");
  const owner = await createUser("cron-owner");
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const orgs = {
    overdue: await createOrg(owner, "cron-overdue"), // missed the last trigger(s)
    never: await createOrg(owner, "cron-never"), // never ran
    recent: await createOrg(owner, "cron-recent"), // ran 10 minutes ago
    paused: await createOrg(owner, "cron-paused"),
  };
  const rows = [
    { organisation_id: orgs.overdue, enabled: true, paused: false, mode: "approval", last_run_at: hoursAgo(3) },
    { organisation_id: orgs.never, enabled: true, paused: false, mode: "manual", last_run_at: null },
    { organisation_id: orgs.recent, enabled: true, paused: false, mode: "approval", last_run_at: hoursAgo(1 / 6) },
    { organisation_id: orgs.paused, enabled: true, paused: true, mode: "approval", last_run_at: hoursAgo(3) },
  ];
  const { error } = await admin.from("automation_settings").insert(rows);
  assert.equal(error, null, error?.message);

  const { claimDueAutomation } = await import("../../../src/lib/automation/engine");
  const { createAdminClient } = await import("../../../src/lib/supabase/admin");
  const mine = new Set(Object.values(orgs));
  const now = new Date();
  // Two triggers at the same moment (e.g. a late GitHub run + the Vercel backup).
  const [a, b] = await Promise.all([
    claimDueAutomation(createAdminClient(), now, 1000),
    claimDueAutomation(createAdminClient(), now, 1000),
  ]);
  const claimed = [...a.claimed, ...b.claimed].filter((id) => mine.has(id)).sort();
  assert.deepEqual(claimed, [orgs.never, orgs.overdue].sort());

  // A trigger a few minutes later finds nothing due for these businesses.
  const later = await claimDueAutomation(createAdminClient(), new Date(now.getTime() + 5 * 60_000), 1000);
  assert.deepEqual(later.claimed.filter((id) => mine.has(id)), []);

  // An hour later the claimed ones and the "recent" one are due again.
  const nextHour = await claimDueAutomation(createAdminClient(), new Date(now.getTime() + 60 * 60_000), 1000);
  assert.deepEqual(
    nextHour.claimed.filter((id) => mine.has(id)).sort(),
    [orgs.never, orgs.overdue, orgs.recent].sort()
  );
});
