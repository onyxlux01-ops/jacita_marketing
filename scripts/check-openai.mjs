/**
 * Probe whether OpenAI is usable for Jacita automation.
 * Usage: node --env-file=.env.local scripts/check-openai.mjs
 */
async function main() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "missing_key",
          message: "OPENAI_API_KEY is not set",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  try {
    const { generateText } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const { text } = await generateText({
      model: openai("gpt-5-mini"),
      prompt: "Reply with exactly: ok",
      maxOutputTokens: 16,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          live: true,
          model: "gpt-5-mini",
          sample: String(text || "").slice(0, 40),
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    let reason = "api_error";
    if (
      lower.includes("no credits remaining") ||
      lower.includes("insufficient_quota") ||
      lower.includes("billing") ||
      lower.includes("exceeded your current quota")
    ) {
      reason = "billing";
    } else if (
      lower.includes("incorrect api key") ||
      lower.includes("invalid_api_key") ||
      (lower.includes("unauthorized") && !lower.includes("max_output_tokens"))
    ) {
      reason = "invalid_key";
    }
    console.log(
      JSON.stringify({ ok: false, live: false, reason, message }, null, 2)
    );
    process.exit(1);
  }
}

main();
