import assert from "node:assert/strict";
import { test } from "node:test";
import { freshDb, asUser, newUser, rpcCreateOrg } from "./db.mjs";

const db = await freshDb();

async function scheduledPost() {
  const owner = await newUser(db, "o");
  const org = await rpcCreateOrg(db, owner, "Edit");
  await db.query(
    `update public.social_accounts set connection_status='connected', external_account_id='ext-fb'
     where organisation_id=$1 and platform='facebook'`,
    [org]
  );
  const content = (
    await db.query(
      `insert into public.content (organisation_id, status, caption) values ($1,'approved','Hi') returning id`,
      [org]
    )
  ).rows[0].id;
  await db.query(
    `insert into public.content_platforms (content_id, platform) values ($1,'facebook')`,
    [content]
  );
  const r = await asUser(
    db,
    null,
    async () =>
      (
        await db.query(
          `select public.schedule_content($1, now() + interval '1 hour', $2, 'v1') as r`,
          [content, owner]
        )
      ).rows[0].r,
    "service_role"
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  return { owner, org, content };
}

const state = async (content) => {
  const c = await db.query(`select status::text from public.content where id=$1`, [content]);
  const j = await db.query(
    `select status::text, hold_reason from public.social_publish_jobs where content_id=$1`,
    [content]
  );
  const cp = await db.query(
    `select publish_status::text from public.content_platforms where content_id=$1`,
    [content]
  );
  return { content: c.rows[0].status, jobs: j.rows, platform: cp.rows[0].publish_status };
};

test("material edit: caption change on scheduled content → review + job held", async () => {
  const s = await scheduledPost();
  await asUser(db, s.owner, () =>
    db.query(`update public.content set caption='New price £40' where id=$1`, [s.content])
  );
  assert.deepEqual(await state(s.content), {
    content: "review",
    jobs: [{ status: "held", hold_reason: "CONTENT_CHANGED" }],
    platform: "held",
  });
});

test("material edit: keeping status=scheduled in the same update is overridden", async () => {
  const s = await scheduledPost();
  await asUser(db, s.owner, () =>
    db.query(`update public.content set media_asset_id=null, title='x', status='scheduled' where id=$1`, [
      s.content,
    ])
  );
  assert.equal((await state(s.content)).content, "review");
});

test("non-material edit and status-only changes leave jobs alone", async () => {
  const s = await scheduledPost();
  await asUser(db, s.owner, () =>
    db.query(`update public.content set voiceover_script='note', scheduled_at=scheduled_at where id=$1`, [
      s.content,
    ])
  );
  assert.deepEqual(await state(s.content), {
    content: "scheduled",
    jobs: [{ status: "pending", hold_reason: null }],
    platform: "scheduled",
  });
});

test("material edit: platform override change → review + job held", async () => {
  const s = await scheduledPost();
  await db.query(
    `update public.content_platforms set hashtags_override=array['new'] where content_id=$1`,
    [s.content]
  );
  assert.deepEqual(await state(s.content), {
    content: "review",
    jobs: [{ status: "held", hold_reason: "CONTENT_CHANGED" }],
    platform: "held",
  });
});

test("draft edits are unaffected", async () => {
  const owner = await newUser(db, "d");
  const org = await rpcCreateOrg(db, owner, "Draft");
  const id = (
    await db.query(`insert into public.content (organisation_id, status) values ($1,'draft') returning id`, [org])
  ).rows[0].id;
  await db.query(`update public.content set caption='edit' where id=$1`, [id]);
  const c = await db.query(`select status::text from public.content where id=$1`, [id]);
  assert.equal(c.rows[0].status, "draft");
});
