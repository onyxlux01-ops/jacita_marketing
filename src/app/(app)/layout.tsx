import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar, MobileBottomNav } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import {
  getActiveOrganisation,
  getSessionUser,
  getUserOrganisations,
} from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";

  const user = await getSessionUser();
  const organisations = await getUserOrganisations();
  const isOnboarding =
    pathname.startsWith("/app/onboarding");

  if (user && organisations.length === 0 && !isOnboarding) {
    redirect("/app/onboarding");
  }

  const active = await getActiveOrganisation(organisations);

  let unreadCount = 0;
  if (user && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      unreadCount = count ?? 0;
    } catch {
      unreadCount = 0;
    }
  }

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar organisations={organisations} active={active} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          organisations={organisations}
          active={active}
          user={user}
          unreadCount={unreadCount}
        />
        <div className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}
