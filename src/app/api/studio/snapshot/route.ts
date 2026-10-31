import { NextResponse } from "next/server";
import { getStudioSnapshot } from "@/lib/studio/snapshot";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

/**
 * Read-only polling endpoint for the Marketing Studio. The business is named
 * explicitly and checked against the caller's memberships, so a studio open on
 * one business can never receive another business's records.
 */
export async function GET(request: Request) {
  const organisationId = new URL(request.url).searchParams.get("organisation_id");
  if (!organisationId)
    return NextResponse.json({ error: "organisation_id is required" }, { status: 400 });
  if (!hasSupabaseEnv())
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const snapshot = await getStudioSnapshot(supabase, organisationId);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Studio records could not be loaded." }, { status: 502 });
  }
}
