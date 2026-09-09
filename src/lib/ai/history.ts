import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AiGenerationType =
  | "assistant"
  | "strategy"
  | "content"
  | "weekly_plan"
  | "campaign"
  | "media_recommend"
  | "insights"
  | "validation";

export async function recordAiGeneration(
  supabase: Supabase,
  input: {
    organisationId: string;
    userId: string | null;
    generationType: AiGenerationType;
    requestText?: string | null;
    inputContext?: Json;
    outputPayload?: Json | null;
    status: "success" | "fallback" | "failed";
    errorMessage?: string | null;
    model?: string | null;
  }
) {
  const { error } = await supabase.from("ai_generations").insert({
    organisation_id: input.organisationId,
    user_id: input.userId,
    generation_type: input.generationType,
    request_text: input.requestText ?? null,
    input_context: input.inputContext ?? {},
    output_payload: input.outputPayload ?? null,
    status: input.status,
    error_message: input.errorMessage ?? null,
    model: input.model ?? null,
  });

  // History must never break the user-facing flow
  if (error) {
    console.error("ai_generations insert failed", error.message);
  }
}
