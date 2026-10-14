import assert from "node:assert/strict";
import { test } from "node:test";
import { freshDb, applyMigrations, newUser, rpcCreateOrg } from "./db.mjs";

const BEFORE = "20261014110100_publish_job_consistency.sql";
const IDENTITY = "20261014120000_account_identity_safety.sql";

test("identity migration backfills targets for active AND failed/expired jobs", async () => {
  const db = await freshDb({ upTo: BEFORE });
  const owner = await newUser(db, "o");
  const org = await rpcCreateOrg(db, owner, "Bf");
  const acct = (
    await db.query(
      `update public.social_accounts set external_account_id='page-1', connection_status='connected'
       where organisation_id=$1 and platform='facebook' returning id`,
      [org]
    )
  ).rows[0].id;
  const statuses = ["pending", "failed", "expired", "published"];
  const ids = {};
  for (const status of statuses) {
    const content = (
      await db.query(
        `insert into public.content (organisation_id, status) values ($1,'scheduled') returning id`,
        [org]
      )
    ).rows[0].id;
    ids[status] = (
      await db.query(
        `insert into public.social_publish_jobs (organisation_id, content_id, social_account_id, platform, scheduled_at, status)
         values ($1,$2,$3,'facebook',now(),$4) returning id`,
        [org, content, acct, status]
      )
    ).rows[0].id;
  }
  await applyMigrations(db, { after: BEFORE, upTo: IDENTITY });
  const r = await db.query(
    `select status::text, target_external_account_id t from public.social_publish_jobs where organisation_id=$1 order by status`,
    [org]
  );
  const by = Object.fromEntries(r.rows.map((x) => [x.status, x.t]));
  assert.equal(by.pending, "page-1");
  assert.equal(by.failed, "page-1");
  assert.equal(by.expired, "page-1");
  assert.equal(by.published, null, "finished jobs are left alone");

  const held = await db.query(`select 'held'::public.platform_publish_status as s`);
  assert.equal(held.rows[0].s, "held");
});
