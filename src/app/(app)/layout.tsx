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
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-background p-3 text-foreground shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
      <AppSidebar
        organisations={organisations}
        active={active}
        canAddBusiness={Boolean(user?.is_platform_admin)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          organisations={organisations}
          active={active}
          user={user}
          unreadCount={unreadCount}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
