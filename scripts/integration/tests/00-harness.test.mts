import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertLocalSupabaseEnv,
  assertLocalUrl,
  LOCAL_API_PORT,
} from "../../lib/assert-local-db.mjs";
import { actAs, admin, createOrg, createUser } from "../helpers.ts";

test("harness: guard rejects non-local hosts", () => {
  assert.throws(() => assertLocalUrl("https://abc.supabase.co"), /Refusing/);
  assert.throws(() => assertLocalUrl("http://10.0.0.5:55421"), /Refusing/);
  assert.equal(assertLocalUrl("http://127.0.0.1:55421"), "http://127.0.0.1:55421");
  assert.equal(assertLocalUrl("http://localhost:55421"), "http://localhost:55421");
});

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

test("harness: guard refuses the default ports (another project's stack)", () => {
  assert.throws(
    () => assertLocalUrl("http://127.0.0.1:54321", "api", LOCAL_API_PORT),
    /expected 55421/
  );
  assert.throws(
    () => assertLocalSupabaseEnv(env({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })),
    /port/
  );
  assert.throws(
    () =>
      assertLocalSupabaseEnv(env({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421",
        SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      })),
    /expected 55422/
  );
  assert.doesNotThrow(() =>
    assertLocalSupabaseEnv(env({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421",
      SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:55422/postgres",
    }))
  );
});

test("harness: real server action runs against the local DB as the acting user", async () => {
  const owner = await createUser("harness-owner");
  const orgId = await createOrg(owner, "harness");
  actAs(owner);
  const { disconnectSocialAccount } = await import(
    "../../../src/app/(app)/app/actions/social"
  );
  const res = await disconnectSocialAccount({
    organisationId: orgId,
    platform: "tiktok",
  });
  assert.deepEqual(res, { success: true });
  const { data } = await admin
    .from("audit_logs")
    .select("action")
    .eq("organisation_id", orgId)
    .eq("action", "social.disconnected");
  assert.equal(data?.length, 1);
  actAs(null);
});
