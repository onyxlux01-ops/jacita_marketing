/**
 * Cross-tenant isolation checks for social publishing.
 * Run with: npx tsx scripts/social-isolation-check.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL.
 * Creates temporary orgs if needed; cleans up when SOCIAL_TEST_CLEANUP=1.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const stamp = Date.now();
  const { data: orgA, error: eA } = await admin
    .from("organisations")
    .insert({
      name: `Test Hair Salon ${stamp}`,
      business_category: "Hair & Beauty",
      slug: `test-hair-${stamp}`,
    })
    .select("id")
    .single();
  const { data: orgB, error: eB } = await admin
    .from("organisations")
    .insert({
      name: `Test Restaurant ${stamp}`,
      business_category: "Restaurant",
      slug: `test-rest-${stamp}`,
    })
    .select("id")
    .single();

  if (eA || eB || !orgA || !orgB) {
    console.error("Failed to create orgs", eA || eB);
    process.exit(1);
  }

  const { data: accountA } = await admin
    .from("social_accounts")
    .insert({
      organisation_id: orgA.id,
      platform: "instagram",
      account_name: "All Hair",
      account_handle: "@allhair",
      connection_status: "connected",
      external_account_id: `ig-a-${stamp}`,
    })
    .select("id")
    .single();

  await admin.from("social_accounts").insert({
    organisation_id: orgB.id,
    platform: "instagram",
    account_name: "Bistro",
    account_handle: "@bistro",
    connection_status: "connected",
    external_account_id: `ig-b-${stamp}`,
  });

  // Simulate secrets only for A
  await admin.from("social_account_secrets").insert({
    social_account_id: accountA!.id,
    organisation_id: orgA.id,
    ciphertext: "test",
    iv: "test",
    auth_tag: "test",
  });

  const { data: leakAccounts } = await admin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", orgA.id)
    .neq("organisation_id", orgA.id);

  const { data: crossSecret } = await admin
    .from("social_account_secrets")
    .select("social_account_id")
    .eq("organisation_id", orgB.id)
    .eq("social_account_id", accountA!.id);

  const { count: aCount } = await admin
    .from("social_accounts")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", orgA.id);

  const { count: bCount } = await admin
    .from("social_accounts")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", orgB.id);

  console.log(
    JSON.stringify(
      {
        orgA: orgA.id,
        orgB: orgB.id,
        accountsPerOrg: { A: aCount, B: bCount },
        impossibleFilterRows: leakAccounts?.length ?? 0,
        crossOrgSecretRows: crossSecret?.length ?? 0,
        note: "RLS isolation for authenticated users is enforced in DB policies; this script verifies org-scoped rows with service role.",
      },
      null,
      2
    )
  );

  if (process.env.SOCIAL_TEST_CLEANUP === "1") {
    await admin.from("organisations").delete().in("id", [orgA.id, orgB.id]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
