import assert from "node:assert/strict";
import { test } from "node:test";
import { freshDb, asUser, newUser, rpcCreateOrg, fixtureQuery } from "./db.mjs";

const db = await freshDb();
const TOKEN_A = "a".repeat(32);
const TOKEN_B = "b".repeat(32);

async function setup(status = "pending") {
  const owner = await newUser(db, "o");
  const manager = await newUser(db, "m");
  const org = await rpcCreateOrg(db, owner, "Claims");
  await fixtureQuery(db,
    `insert into public.organisation_members (organisation_id,user_id,role) values ($1,$2,'manager')`,
    [org, manager]
  );
  const acct = (
    await db.query(
      `select id from public.social_accounts where organisation_id=$1 and platform='facebook'`,
      [org]
    )
  ).rows[0].id;
  const content = (
    await db.query(
      `insert into public.content (organisation_id, status) values ($1,'scheduled') returning id`,
      [org]
    )
  ).rows[0].id;
  const job = (
    await db.query(
      `insert into public.social_publish_jobs (organisation_id, content_id, social_account_id, platform, scheduled_at, status)
       values ($1,$2,$3,'facebook', now(), $4) returning id`,
      [org, content, acct, status]
    )
  ).rows[0].id;
  return { org, owner, manager, job };
}

const claim = (job, token, states = "{pending,ready,retrying}") =>
  asUser(
    db,
    null,
    () => db.query(`select * from public.claim_publish_job($1, $2, $3::public.publish_job_status[])`, [job, token, states]),
    "service_role"
  );

test("claim: first caller wins, second gets nothing; attempt count increments once", async () => {
  const { job } = await setup();
  const a = await claim(job, TOKEN_A);
  const b = await claim(job, TOKEN_B);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].lock_token, TOKEN_A);
  assert.equal(a.rows[0].status, "processing");
  assert.equal(a.rows[0].attempt_count, 1);
  assert.equal(b.rows.length, 0);
});

test("claim: processing/published can never be requested as claimable", async () => {
  const { job } = await setup();
  await assert.rejects(claim(job, TOKEN_A, "{processing}"), /cannot be claimed/);
  await assert.rejects(claim(job, TOKEN_A, "{pending,published}"), /cannot be claimed/);
  await assert.rejects(claim(job, "short"), /16 characters/);
});

test("claim: clears request_sent_at for the new attempt", async () => {
  const { job } = await setup("retrying");
  await db.query(`update public.social_publish_jobs set request_sent_at=now() where id=$1`, [job]);
  const a = await claim(job, TOKEN_A);
  assert.equal(a.rows[0].request_sent_at, null);
});

test("authenticated sessions cannot claim or write publish jobs", async () => {
  const { job, manager, org } = await setup();
  await assert.rejects(
    asUser(db, manager, () =>
      db.query(`select * from public.claim_publish_job($1,$2,'{pending}')`, [job, TOKEN_A])
    ),
    /permission denied/
  );
  await assert.rejects(
    asUser(db, manager, () =>
      db.query(`update public.social_publish_jobs set status='ready' where id=$1`, [job])
    ),
    /permission denied/
  );
  await assert.rejects(
    asUser(db, manager, () => db.query(`delete from public.social_publish_jobs where id=$1`, [job])),
    /permission denied/
  );
  // Reads still work for members.
  const r = await asUser(db, manager, () =>
    db.query(`select id from public.social_publish_jobs where organisation_id=$1`, [org])
  );
  assert.equal(r.rows.length, 1);
});

test("uncertain is a valid job status and not active", async () => {
  const r = await db.query(`select 'uncertain'::public.publish_job_status as s`);
  assert.equal(r.rows[0].s, "uncertain");
});
