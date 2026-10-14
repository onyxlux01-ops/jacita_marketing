import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { freshDb, asUser, newUser, rpcCreateOrg, fixtureQuery } from "./db.mjs";

const db = await freshDb();
const HASH = "v".repeat(32);

async function setup({ status = "approved", connect = ["facebook", "instagram"] } = {}) {
  const owner = await newUser(db, "o");
  const staff = await newUser(db, "s");
  const org = await rpcCreateOrg(db, owner, "Sched");
  await fixtureQuery(db,
    `insert into public.organisation_members (organisation_id,user_id,role) values ($1,$2,'staff')`,
    [org, staff]
  );
  const accounts = {};
  for (const p of ["facebook", "instagram"]) {
    accounts[p] = (
      await db.query(
        `update public.social_accounts
           set connection_status = $3, external_account_id = $4
         where organisation_id=$1 and platform=$2 returning id`,
        [org, p, connect.includes(p) ? "connected" : "not_connected", connect.includes(p) ? `ext-${p}` : null]
      )
    ).rows[0].id;
  }
  const content = (
    await db.query(
      `insert into public.content (organisation_id, status) values ($1,$2) returning id`,
      [org, status]
    )
  ).rows[0].id;
  const cps = {};
  for (const p of ["facebook", "instagram"]) {
    cps[p] = (
      await db.query(
        `insert into public.content_platforms (content_id, platform) values ($1,$2) returning id`,
        [content, p]
      )
    ).rows[0].id;
  }
  return { owner, staff, org, accounts, content, cps };
}

const future = () => new Date(Date.now() + 3600_000).toISOString();

const schedule = (s, at = future(), actor = s.owner, extra = {}) =>
  asUser(
    db,
    null,
    async () =>
      (
        await db.query(
          `select public.schedule_content($1, $2::timestamptz, $3, $4, '{}'::jsonb, $5::public.social_platform[], $6) as r`,
          [s.content, at, actor, HASH, extra.platforms ?? null, extra.allowImmediate ?? false]
        )
      ).rows[0].r,
    "service_role"
  );

const jobs = async (content) =>
  (
    await db.query(
      `select platform::text, status::text, idempotency_key, target_external_account_id, social_account_id
       from public.social_publish_jobs where content_id=$1 order by platform, created_at`,
      [content]
    )
  ).rows;

test("schedule: queues every usable platform in one go and marks rows scheduled", async () => {
  const s = await setup();
  const r = await schedule(s);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.platforms.map((p) => [p.platform, p.status]).sort(), [
    ["facebook", "queued"],
    ["instagram", "queued"],
  ]);
  const js = await jobs(s.content);
  assert.equal(js.length, 2);
  assert.ok(js.every((j) => j.status === "pending" && j.target_external_account_id));
  // Idempotency key matches the TypeScript buildIdempotencyKey formula.
  const fb = js.find((j) => j.platform === "facebook");
  const expected = createHash("sha256")
    .update(`${s.org}:${s.content}:${fb.social_account_id}:${HASH}`)
    .digest("hex")
    .slice(0, 40);
  assert.equal(fb.idempotency_key, expected);
  const c = await db.query(`select status::text from public.content where id=$1`, [s.content]);
  assert.equal(c.rows[0].status, "scheduled");
  const cp = await db.query(
    `select publish_status::text s from public.content_platforms where content_id=$1`,
    [s.content]
  );
  assert.ok(cp.rows.every((x) => x.s === "scheduled"));
});

test("schedule: no matching accounts → error and NOTHING changes", async () => {
  const s = await setup({ connect: [] });
  const r = await schedule(s);
  assert.equal(r.ok, false);
  assert.equal(r.code, "NO_MATCHING_ACCOUNTS");
  assert.equal((await jobs(s.content)).length, 0);
  const c = await db.query(`select status::text, scheduled_at from public.content where id=$1`, [s.content]);
  assert.deepEqual(c.rows[0], { status: "approved", scheduled_at: null });
});

test("schedule: an insert failure keeps the old jobs (no partial cancel)", async () => {
  const s = await setup();
  // Old queued facebook job + an instagram post already publishing.
  await db.query(
    `insert into public.social_publish_jobs (organisation_id, content_id, content_platform_id, social_account_id, platform, scheduled_at, status, target_external_account_id)
     values ($1,$2,$3,$4,'facebook', now() + interval '2 hours', 'pending', 'ext-facebook'),
            ($1,$2,$5,$6,'instagram', now(), 'processing', 'ext-instagram')`,
    [s.org, s.content, s.cps.facebook, s.accounts.facebook, s.cps.instagram, s.accounts.instagram]
  );
  const r = await schedule(s);
  assert.equal(r.ok, false);
  assert.equal(r.code, "ALREADY_PUBLISHING");
  const js = await jobs(s.content);
  assert.deepEqual(js.map((j) => [j.platform, j.status]), [
    ["facebook", "pending"],
    ["instagram", "processing"],
  ]);
  const c = await db.query(`select status::text from public.content where id=$1`, [s.content]);
  assert.equal(c.rows[0].status, "approved");
});

test("schedule: rescheduling twice leaves exactly one active job per account", async () => {
  const s = await setup();
  assert.equal((await schedule(s)).ok, true);
  assert.equal((await schedule(s)).ok, true);
  const js = await jobs(s.content);
  assert.equal(js.filter((j) => j.status === "pending").length, 2);
  assert.equal(js.filter((j) => j.status === "cancelled").length, 2);
});

test("schedule: invalid / past / far-future timestamps are rejected", async () => {
  const s = await setup();
  const past = await schedule(s, new Date(Date.now() - 3600_000).toISOString());
  assert.equal(past.code, "INVALID_TIME");
  const far = await schedule(s, new Date(Date.now() + 400 * 86400_000).toISOString());
  assert.equal(far.code, "INVALID_TIME");
  const nul = await asUser(
    db,
    null,
    async () =>
      (await db.query(`select public.schedule_content($1, null, $2, $3) as r`, [s.content, s.owner, HASH])).rows[0].r,
    "service_role"
  );
  assert.equal(nul.code, "INVALID_TIME");
  await assert.rejects(schedule(s, "not-a-date"), /invalid input syntax/);
  // Publish now may use "now".
  const now = await schedule(s, new Date(Date.now() - 5_000).toISOString(), s.owner, {
    allowImmediate: true,
    platforms: "{facebook}",
  });
  assert.equal(now.ok, true);
  assert.equal((await jobs(s.content)).length, 1);
});

test("schedule: staff actor and unapproved content are refused", async () => {
  const s = await setup();
  assert.equal((await schedule(s, future(), s.staff)).code, "FORBIDDEN");
  const d = await setup({ status: "draft" });
  assert.equal((await schedule(d)).code, "NOT_APPROVED");
  assert.equal((await jobs(d.content)).length, 0);
});

test("schedule: browser sessions cannot call the RPC", async () => {
  const s = await setup();
  await assert.rejects(
    asUser(db, s.owner, () =>
      db.query(`select public.schedule_content($1, now() + interval '1 hour', $2, $3)`, [s.content, s.owner, HASH])
    ),
    /permission denied/
  );
});
