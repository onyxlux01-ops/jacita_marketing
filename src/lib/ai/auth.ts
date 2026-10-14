import type { createClient } from "@/lib/supabase/server";
import { bindAiSpend } from "@/lib/ai/spend/context";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function requireOrgAccess(
  supabase: Supabase,
  organisationId: string
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" as const, status: 401 as const };
  }

  const { data: membership } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: "Forbidden" as const, status: 403 as const };
  }

  // AI calls made for the rest of this request are charged to this business
  // and user (see withAiRoute / the AI spend guard).
  bindAiSpend(organisationId, user.id);

  return { user, membership };
}
