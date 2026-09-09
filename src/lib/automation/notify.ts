import { createAdminClient } from "@/lib/supabase/admin";

/** Notify org owners/managers — only for genuine intervention cases. */
export async function notifyAutomationIssue(input: {
  organisationId: string;
  title: string;
  body: string;
}) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", input.organisationId)
    .in("role", ["owner", "manager"]);

  for (const m of members ?? []) {
    await admin.from("notifications").insert({
      user_id: m.user_id,
      organisation_id: input.organisationId,
      title: input.title,
      body: input.body,
    });
  }
}
