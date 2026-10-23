export type PublishOutcomeInput = {
  error?: string;
  success?: boolean;
  status?: string;
  inProgress?: boolean;
  message?: string;
  duplicate?: boolean;
  simulated?: boolean;
  externalUrl?: string | null;
};

export function describePublishOutcome(result: PublishOutcomeInput): {
  tone: "error" | "success" | "info";
  message: string;
  url?: string;
} {
  if (result.error) return { tone: "error", message: result.error };
  if (result.simulated) return { tone: "info", message: "Simulation complete. No live post was published." };
  if (result.inProgress) return { tone: "info", message: result.message || "Publication is in progress. The provider has not confirmed it yet." };
  if (result.success && result.status === "published") {
    let url: string | undefined;
    try {
      const parsed = new URL(result.externalUrl || "");
      if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.href;
    } catch { /* No provider link was returned. */ }
    return { tone: "success", message: result.duplicate ? "Already published. No new post was created." : "Publication confirmed by the provider.", url };
  }
  return { tone: "info", message: "Publication is awaiting confirmation. Check Automation → Publishing for its latest status." };
}
