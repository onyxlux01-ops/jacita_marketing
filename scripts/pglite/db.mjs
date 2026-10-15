/**
 * PGlite fallback harness — SQL-level checks for our migrations when Docker /
 * the local Supabase stack is unavailable.
 *
 *   npm run test:pglite
 *
 * What it is: an in-process Postgres (PGlite, PG 18 in WASM) with a minimal
 * Supabase shim (roles anon/authenticated/service_role, auth.uid() from the
 * request.jwt.claim.sub setting, storage stubs, legacy default grants). Every
 * migration in supabase/migrations is applied in its own transaction, then
 * tests run SQL as `authenticated` / `service_role` the way PostgREST does
 * (SET LOCAL ROLE + JWT claim).
 *
 * What it is NOT: a substitute for `npm run test:integration` against
 * `supabase start`. It does not run PostgREST, GoTrue, the app's server
 * code, real Supabase role attributes or grants, or Postgres 17. Treat a pass
 * here as "the SQL logic is right", not "the deployment is right".
 *
 * No network, no URL: it can never touch a remote database.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG = process.env.MIG_DIR || "supabase/migrations";

/** Apply migrations whose file name is > `after` (and <= `upTo` if given). */
export async function applyMigrations(db, { after, upTo } = {}) {
  const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (after && f <= after) continue;
    if (upTo && f > upTo) break;
    const sql = readFileSync(join(MIG, f), "utf8");
    try {
      await db.exec(`begin;\n${sql}\ncommit;`);
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
}

export async function freshDb({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(new URL("./shim.sql", import.meta.url), "utf8"));
  const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (upTo && f > upTo) break;
    const sql = readFileSync(join(MIG, f), "utf8");
    try {
      await db.exec(`begin;\n${sql}\ncommit;`);
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  return db;
}

/** Run fn inside a transaction as a role (like PostgREST: SET LOCAL ROLE + JWT sub). */
export async function asUser(db, userId, fn, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await db.exec(`set local role ${role}`);
    const r = await fn();
    await db.exec("commit");
    return r;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

export async function newUser(db, label) {
  const r = await db.query(
    `insert into auth.users (email) values ($1) returning id`,
    [`${label}-${Math.random().toString(36).slice(2)}@t.local`]
  );
  return r.rows[0].id;
}

export async function setPlatformAdmin(db, userId, value) {
  await db.exec(`alter table public.users disable trigger users_protect_platform_admin`);
  await db.query(`update public.users set is_platform_admin = $2 where id = $1`, [userId, value]);
  await db.exec(`alter table public.users enable trigger users_protect_platform_admin`);
}

export async function makePlatformAdmin(db, userId) {
  await setPlatformAdmin(db, userId, true);
}

/** Call create_organisation as `userId` exactly as given (no fixture help). */
export async function callCreateOrg(db, userId, name = "Org", role = "authenticated") {
  return asUser(
    db,
    userId,
    async () => {
      const r = await db.query(`select public.create_organisation($1, $2) as id`, [
        name,
        `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
      ]);
      return r.rows[0].id;
    },
    role
  );
}

/**
 * Fixture: a business owned by `userId`. Only the platform admin may create
 * businesses, so an ordinary user is flagged admin just for the call (the
 * creator still becomes the first owner through the real RPC).
 */
export async function rpcCreateOrg(db, userId, name = "Org") {
  const r = await db.query(`select is_platform_admin from public.users where id = $1`, [userId]);
  const wasAdmin = r.rows[0]?.is_platform_admin === true;
  if (!wasAdmin) await setPlatformAdmin(db, userId, true);
  try {
    return await callCreateOrg(db, userId, name);
  } finally {
    if (!wasAdmin) await setPlatformAdmin(db, userId, false);
  }
}

/**
 * Fixture write that needs to bypass the "members join via accept_invite"
 * guard: runs in a transaction with the accept_invite flag set, as the
 * database owner (trusted), exactly like the RPC does.
 */
export async function fixtureQuery(db, sql, params = []) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('jacita.invite_accept', 'on', true)`);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return r;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
