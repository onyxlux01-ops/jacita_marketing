export {
  runAutomationForOrganisation,
  runAutomationForAllEnabled,
  getOrgSetupReadiness,
} from "@/lib/automation/engine";
export {
  getAutomationSettings,
  ensureAutomationSettings,
  setAutomationState,
  logAutomationActivity,
  modeToOrgAutopilot,
  CONTENT_PREFERENCE_OPTIONS,
  AUTOMATION_GOAL_OPTIONS,
} from "@/lib/automation/settings";
export type {
  AutomationMode,
  AutomationState,
  AutomationSettings,
  AiFreedomLevel,
} from "@/lib/automation/settings";
export {
  validateAutomationAction,
  isQuietHour,
} from "@/lib/automation/guardrails";
export {
  getAutomationStatus,
  getCurrentAIActivity,
  getWorkQueue,
  getUpcomingContent,
  getRecentlyPublished,
  getAIInsights,
  getAutomationTimeline,
  getNeedsAttention,
  getAutomationHealth,
  getApprovalQueue,
  freedomGuidance,
} from "@/lib/automation/control";
