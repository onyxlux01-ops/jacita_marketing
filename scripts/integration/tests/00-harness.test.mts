import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLocalUrl } from "../../lib/assert-local-db.mjs";
import { actAs, admin, createOrg, createUser } from "../helpers.ts";

test("harness: guard rejects non-local hosts", () => {
  assert.throws(() => assertLocalUrl("https://abc.supabase.co"), /Refusing/);
  assert.throws(() => assertLocalUrl("http://10.0.0.5:54321"), /Refusing/);
  assert.equal(assertLocalUrl("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
  assert.equal(assertLocalUrl("http://localhost:54321"), "http://localhost:54321");
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
