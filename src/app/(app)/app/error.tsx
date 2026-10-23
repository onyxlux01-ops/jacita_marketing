"use client";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className="glass-panel mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">
        This workspace could not be loaded
      </h1>
      <p className="my-4 text-sm text-muted-foreground">
        Please retry. If the issue continues, check your connection and sign in
        again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
