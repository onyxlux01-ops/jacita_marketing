import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { PlatformBusinessList } from "./business-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PlatformAdminPage() {
  const user = await getSessionUser();

  if (!user?.is_platform_admin) {
    redirect("/app");
  }

  let businesses: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    business_category: string | null;
    created_at: string;
  }> = [];

  if (hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("organisations")
        .select("id, name, slug, status, plan, business_category, created_at")
        .order("created_at", { ascending: false });
      businesses = data ?? [];
    } catch {
      businesses = [];
    }
  }

  const activeCount = businesses.filter((b) => b.status === "active").length;
  const disabledCount = businesses.filter((b) => b.status === "disabled").length;
  const trialCount = businesses.filter((b) => b.status === "trial").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Platform
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight">
          Admin foundation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage businesses across Jacita. Gated by{" "}
          <code className="text-xs">is_platform_admin</code>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total businesses", value: businesses.length },
          { label: "Active / trial", value: activeCount + trialCount },
          { label: "Disabled", value: disabledCount },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-0">
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Businesses</CardTitle>
          <CardDescription>Disable or re-enable organisations</CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformBusinessList businesses={businesses} />
        </CardContent>
      </Card>
    </div>
  );
}
