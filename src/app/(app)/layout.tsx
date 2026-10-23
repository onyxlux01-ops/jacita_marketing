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
import "./workspace.css";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";

  const user = await getSessionUser();
  const organisations = await getUserOrganisations();
  const isOnboarding = pathname.startsWith("/app/onboarding");

  if (user && organisations.length === 0 && !isOnboarding) {
    redirect("/app/onboarding");
  }

  const active = await getActiveOrganisation(organisations);

  let unreadCount = 0;
  let attentionCount: number | null = null;
  if (user && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      unreadCount = count ?? 0;
      if (active) {
        const { count: needsReview, error } = await supabase
          .from("content")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", active.id)
          .in("status", ["review", "failed"]);
        if (!error) attentionCount = needsReview ?? 0;
      }
    } catch {
      unreadCount = 0;
    }
  }

  return (
    <div className="workspace-theme dark workspace-shell flex min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-background p-3 text-foreground shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <AppSidebar
        organisations={organisations}
        active={active}
        canAddBusiness={Boolean(user?.is_platform_admin)}
      />
      <div className="workspace-body flex min-w-0 flex-1 flex-col">
        <AppTopbar
          organisations={organisations}
          active={active}
          user={user}
          unreadCount={unreadCount}
          attentionCount={attentionCount}
        />
        <main id="main-content" tabIndex={-1} className="workspace-main flex-1">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
