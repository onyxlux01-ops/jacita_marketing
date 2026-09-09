import Link from "next/link";
import { CreateBusinessForm } from "./create-business-form";
import { getUserOrganisations } from "@/lib/org";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage() {
  const orgs = await getUserOrganisations();
  const isAdditional = orgs.length > 0;

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
