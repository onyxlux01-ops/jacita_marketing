import assert from "node:assert/strict";
import { test } from "node:test";
import { freshDb, applyMigrations, asUser, newUser, rpcCreateOrg } from "./db.mjs";

const BEFORE_PR1 = "20260921000000_org_meta_apps.sql";

test("autopilot downgrade records each business's previous mode in audit_logs", async () => {
  const db = await freshDb({ upTo: BEFORE_PR1 });
  const owner = await newUser(db, "o");
  const org = await rpcCreateOrg(db, owner, "Auto");
  await db.query(`update public.organisations set autopilot_mode='autopilot' where id=$1`, [org]);
  await db.query(`insert into public.automation_settings (organisation_id, mode) values ($1,'autopilot')`, [org]);
  await db.query(`insert into public.advertising_settings (organisation_id, mode) values ($1,'autopilot')`, [org]);

  await applyMigrations(db, { after: BEFORE_PR1 });

  const audit = await db.query(
    `select entity_type, metadata->>'previous_mode' as prev from public.audit_logs
     where organisation_id=$1 and action='settings.autopilot_downgraded' order by entity_type`,
    [org]
  );
  assert.deepEqual(audit.rows, [
    { entity_type: "advertising_settings", prev: "autopilot" },
    { entity_type: "automation_settings", prev: "autopilot" },
    { entity_type: "organisations", prev: "autopilot" },
  ]);
  const o = await db.query(`select autopilot_mode from public.organisations where id=$1`, [org]);
  assert.equal(o.rows[0].autopilot_mode, "approval_required");
});

test("transfer flag is ignored in an untrusted (authenticated) session", async () => {
  const db = await freshDb();
  const owner = await newUser(db, "o");
  const manager = await newUser(db, "m");
  const org = await rpcCreateOrg(db, owner, "Flag");
  await db.query(
    `insert into public.organisation_members (organisation_id,user_id,role) values ($1,$2,'manager')`,
    [org, manager]
  );
  // Even if a session manages to set the GUC, an authenticated writer is
  // still subject to every rule (owner here tries to promote the manager).
  await assert.rejects(
    asUser(db, owner, async () => {
      await db.query(`select set_config('jacita.ownership_transfer', 'on', true)`);
      return db.query(
        `update public.organisation_members set role='owner' where organisation_id=$1 and user_id=$2`,
        [org, manager]
      );
    }),
    /transfer_ownership/
  );
  await assert.rejects(
    asUser(db, owner, async () => {
      await db.query(`select set_config('jacita.ownership_transfer', 'on', true)`);
      return db.query(
        `delete from public.organisation_members where organisation_id=$1 and user_id=$2`,
        [org, owner]
      );
    }),
    /Transfer ownership/
  );
});

test("deleting the auth user who owns a business is blocked", async () => {
  const db = await freshDb();
  const owner = await newUser(db, "o");
  await rpcCreateOrg(db, owner, "Del");
  await assert.rejects(db.query(`delete from auth.users where id=$1`, [owner]), /Transfer ownership/);
  const still = await db.query(`select count(*)::int n from auth.users where id=$1`, [owner]);
  assert.equal(still.rows[0].n, 1);
});

test("ads tables have explicit grants for authenticated and service_role, none for anon", async () => {
  const db = await freshDb();
  const r = await db.query(
    `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
     from information_schema.role_table_grants
     where table_schema='public' and table_name='advertising_settings'
       and grantee in ('anon','authenticated','service_role')
     group by 1,2 order by 2`
  );
  const by = Object.fromEntries(r.rows.map((x) => [x.grantee, x.privs]));
  assert.equal(by.anon, undefined);
  assert.match(by.authenticated, /DELETE.*INSERT.*SELECT.*UPDATE/);
  assert.match(by.service_role, /INSERT.*SELECT.*UPDATE/);
});
