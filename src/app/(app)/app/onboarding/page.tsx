import Link from "next/link";
import { CreateBusinessForm } from "./create-business-form";
import { getSessionUser, getUserOrganisations } from "@/lib/org";
import { CREATE_BUSINESS_ADMIN_ONLY_MESSAGE } from "@/lib/org/business-creation";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage() {
  const [user, orgs] = await Promise.all([getSessionUser(), getUserOrganisations()]);
  const isAdditional = orgs.length > 0;

  // Only the platform admin may create businesses (create_organisation
  // refuses everyone else). Everyone else joins through an invite.
  if (!user?.is_platform_admin) {
    return (
      <div className="jacita-page jacita-enter max-w-2xl space-y-6">
        <header>
          <p className="jacita-label">{isAdditional ? "Add business" : "Welcome"}</p>
          <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
            {isAdditional
              ? "Adding businesses is admin-only"
              : "You're not part of a business yet"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAdditional
              ? CREATE_BUSINESS_ADMIN_ONLY_MESSAGE
              : `Your account isn't linked to a business yet. Ask the workspace administrator to send you an invite, then open the link in that email to join. ${CREATE_BUSINESS_ADMIN_ONLY_MESSAGE}`}
          </p>
        </header>

        {isAdditional ? (
          <Button asChild variant="ghost" className="rounded-xl">
            <Link href="/app">Back to dashboard</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="jacita-page jacita-enter max-w-2xl space-y-6">
      <header>
        <p className="jacita-label">
          {isAdditional ? "Add business" : "Welcome"}
        </p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          {isAdditional
            ? "Create another business"
            : "Let's set up your business"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAdditional
            ? "Each business has its own brand, content, media, and social accounts — never mixed."
            : "Your marketing assistant needs a few details to understand your business, brand and customers."}
        </p>
      </header>

      <CreateBusinessForm isAdditional={isAdditional} />

      {isAdditional ? (
        <Button asChild variant="ghost" className="rounded-xl">
          <Link href="/app">Back to dashboard</Link>
        </Button>
      ) : null}
    </div>
  );
}
