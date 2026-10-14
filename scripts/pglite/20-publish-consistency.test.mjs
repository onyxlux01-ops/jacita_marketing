import assert from "node:assert/strict";
import { test } from "node:test";
import { freshDb, asUser, newUser, rpcCreateOrg } from "./db.mjs";

const db = await freshDb();

async function org(label) {
  const owner = await newUser(db, label);
  const id = await rpcCreateOrg(db, owner, label);
  const acct = async (p) =>
    (await db.query(`select id from public.social_accounts where organisation_id=$1 and platform=$2`, [id, p])).rows[0].id;
  const content = (
    await db.query(`insert into public.content (organisation_id, status, created_by) values ($1,'scheduled',$2) returning id`, [id, owner])
  ).rows[0].id;
  const cpFb = (
    await db.query(`insert into public.content_platforms (content_id, platform) values ($1,'facebook') returning id`, [content])
  ).rows[0].id;
  return { id, owner, content, cpFb, fb: await acct("facebook"), ig: await acct("instagram") };
}

const insertJob = (o, over = {}) => {
  const j = {
    organisation_id: o.id,
    content_id: o.content,
    content_platform_id: o.cpFb,
    social_account_id: o.fb,
    platform: "facebook",
    ...over,
  };
  return db.query(
    `insert into public.social_publish_jobs (organisation_id, content_id, content_platform_id, social_account_id, platform, scheduled_at, created_by)
     values ($1,$2,$3,$4,$5, now(), null) returning id`,
    [j.organisation_id, j.content_id, j.content_platform_id, j.social_account_id, j.platform]
  );
};

test("held status exists and is not an active status", async () => {
  const r = await db.query(`select 'held'::public.publish_job_status as s`);
  assert.equal(r.rows[0].s, "held");
});

test("consistent job inserts fine (service role)", async () => {
  const a = await org("A");
  const r = await asUser(db, null, () => insertJob(a), "service_role");
  assert.equal(r.rows.length, 1);
});

test("foreign content_platform_id is rejected, even for service role", async () => {
  const a = await org("A2");
  const b = await org("B2");
  await assert.rejects(
    asUser(db, null, () => insertJob(a, { content_platform_id: b.cpFb }), "service_role"),
    /platform row does not belong/
  );
});

test("foreign social account / content / platform mismatch rejected", async () => {
  const a = await org("A3");
  const b = await org("B3");
  await assert.rejects(insertJob(a, { social_account_id: b.fb }), /different business/);
  await assert.rejects(insertJob(a, { content_id: b.content, content_platform_id: null }), /content belongs/);
  await assert.rejects(insertJob(a, { social_account_id: a.ig }), /different platform/);
});

test("updating a job to point at a foreign row is rejected", async () => {
  const a = await org("A4");
  const b = await org("B4");
  const id = (await insertJob(a)).rows[0].id;
  await assert.rejects(
    db.query(`update public.social_publish_jobs set content_platform_id=$1 where id=$2`, [b.cpFb, id]),
    /platform row/
  );
});

test("content_platforms.social_account_id must be same business + platform", async () => {
  const a = await org("A5");
  const b = await org("B5");
  await assert.rejects(
    db.query(`update public.content_platforms set social_account_id=$1 where id=$2`, [b.fb, a.cpFb]),
    /same business and platform/
  );
  await assert.rejects(
    db.query(`update public.content_platforms set social_account_id=$1 where id=$2`, [a.ig, a.cpFb]),
    /same business and platform/
  );
  const ok = await db.query(`update public.content_platforms set social_account_id=$1 where id=$2`, [a.fb, a.cpFb]);
  assert.equal(ok.affectedRows, 1);
});
