/**
 * Guardrails for in-house marketing automation.
 * AI decisions must pass these before execution.
 */

const FORBIDDEN_ACTION_PATTERNS = [
  /change.?price/i,
  /fake.?discount/i,
  /invent.?service/i,
  /invent.?product/i,
  /invent.?testimonial/i,
  /medical.?claim/i,
  /legal.?claim/i,
  /guarantee/i,
  /paid.?ad/i,
  /ad.?budget/i,
  /spend.?money/i,
  /delete.?post/i,
  /change.?account.?setting/i,
];

export type StructuredAutomationAction = {
  action:
    | "schedule_post"
    | "publish_post"
    | "generate_content"
    | "update_strategy"
    | "analyse_performance"
    | "request_approval"
    | "request_media"
    | "select_media"
    | "retry_publish"
    | "pause_automation"
    | "skip";
  platform?: string | null;
  content_id?: string | null;
  scheduled_time?: string | null;
  reason?: string | null;
  confidence?: number | null;
};

export type GuardrailResult =
  | { ok: true }
  | { ok: false; reason: string; requiresHuman: boolean };

export function validateAutomationAction(
  decision: StructuredAutomationAction,
  context: {
    mode: "off" | "manual" | "approval" | "autopilot";
    paused: boolean;
    enabled: boolean;
    organisationId: string;
    contentOrganisationId?: string | null;
    platformsAllowed: string[];
  }
): GuardrailResult {
  if (!context.enabled || context.mode === "off") {
    return {
      ok: false,
      reason: "Automation is off for this business.",
      requiresHuman: false,
    };
  }
  if (context.paused) {
    return {
      ok: false,
      reason: "Automation is paused.",
      requiresHuman: true,
    };
  }

  const blob = `${decision.action} ${decision.reason || ""}`;
  for (const pattern of FORBIDDEN_ACTION_PATTERNS) {
    if (pattern.test(blob)) {
      return {
        ok: false,
        reason: "Action blocked by guardrails — requires human approval.",
        requiresHuman: true,
      };
    }
  }

  if (
    decision.content_id &&
    context.contentOrganisationId &&
    context.contentOrganisationId !== context.organisationId
  ) {
    return {
      ok: false,
      reason: "Content does not belong to this business.",
      requiresHuman: true,
    };
  }

  if (
    decision.platform &&
    !context.platformsAllowed.includes(decision.platform)
  ) {
    return {
      ok: false,
      reason: `Platform ${decision.platform} is not enabled for automation.`,
      requiresHuman: false,
    };
  }

  if (
    (decision.action === "publish_post" ||
      decision.action === "retry_publish") &&
    context.mode !== "autopilot"
  ) {
    return {
      ok: false,
      reason: "Publishing requires Autopilot mode.",
      requiresHuman: true,
    };
  }

  if (decision.action === "pause_automation") {
    return { ok: true };
  }

  if (
    decision.action === "schedule_post" &&
    context.mode === "manual"
  ) {
    return {
      ok: false,
      reason: "Manual mode does not auto-schedule.",
      requiresHuman: true,
    };
  }

  return { ok: true };
}

export function isQuietHour(
  quietHours: { start?: string; end?: string } | null | undefined,
  now = new Date()
) {
  if (!quietHours?.start || !quietHours?.end) return false;
  const [sh, sm] = quietHours.start.split(":").map(Number);
  const [eh, em] = quietHours.end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}
