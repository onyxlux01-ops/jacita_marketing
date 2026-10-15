/**
 * Test fixture: create a business owned by an ordinary test user, LOCAL only.
 *
 * Only the platform admin may call create_organisation()
 * (migration 20261015100000_admin_only_create_organisation). Most tests still
 * need businesses whose owner is an ordinary user, so this fixture goes to the
 * LOCAL Postgres (guarded) and, inside ONE transaction:
 *
 *   1. flags the user as platform admin (bypassing the users trigger, like
 *      the makePlatformAdmin fixtures do),
 *   2. calls the real public.create_organisation() as that user
 *      (role authenticated + JWT claims, the way PostgREST does), so the
 *      creator becomes the first owner through the normal trusted path,
 *   3. removes the flag again (unless the user was already an admin),
 *
 * then commits. Nothing outside the transaction ever sees the temporary flag,
 * and the database rule itself is not relaxed.
 */
import { assertLocalUrl, LOCAL_DB_PORT } from "./assert-local-db.mjs";

const ARG_ORDER = [
  "p_name",
  "p_slug",
  "p_business_category",
  "p_description",
  "p_location",
  "p_website",
  "p_booking_url",
  "p_phone",
  "p_email",
  "p_opening_hours",
];

/**
 * @param {string} userId  auth user who becomes the owner
 * @param {Record<string, unknown>} params  create_organisation arguments (p_name, p_slug, ...)
 * @param {string} [dbUrl] defaults to process.env.SUPABASE_DB_URL
 * @returns {Promise<string>} the new organisation id
 */
export async function createOrgAsOwner(userId, params, dbUrl = process.env.SUPABASE_DB_URL) {
  assertLocalUrl(dbUrl, "SUPABASE_DB_URL", LOCAL_DB_PORT);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("begin");
    const before = await client.query(
      "select is_platform_admin from public.users where id = $1",
      [userId]
    );
    if (!before.rows.length) throw new Error(`[create-test-org] no public.users row for ${userId}`);
    const wasAdmin = before.rows[0].is_platform_admin === true;

    if (!wasAdmin) {
      await client.query("set local session_replication_role = replica");
      await client.query("update public.users set is_platform_admin = true where id = $1", [userId]);
      await client.query("set local session_replication_role = origin");
    }

    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("set local role authenticated");
    const args = ARG_ORDER.map((k) => (k in params ? params[k] ?? null : null));
    const r = await client.query(
      `select public.create_organisation(${ARG_ORDER.map((_, i) => `$${i + 1}`).join(", ")}) as id`,
      args
    );
    await client.query("reset role");

    if (!wasAdmin) {
      await client.query("set local session_replication_role = replica");
      await client.query("update public.users set is_platform_admin = false where id = $1", [userId]);
      await client.query("set local session_replication_role = origin");
    }

    await client.query("commit");
    return r.rows[0].id;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}
