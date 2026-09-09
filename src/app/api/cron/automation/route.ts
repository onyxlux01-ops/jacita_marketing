import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAutomationForAllEnabled } from "@/lib/automation";

async function authorize(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) {
    return { ok: true as const, via: "cron" as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, via: "admin" as const };
}

export async function GET(request: Request) {
  const access = await authorize(request);
  if (!access.ok) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: access.status }
    );
  }

  try {
    const result = await runAutomationForAllEnabled();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
