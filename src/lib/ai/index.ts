export { MARKETING_GOALS, goalLabel, mapLegacyObjective } from "@/lib/ai/goals";
export type { MarketingGoalKey, AiContentType } from "@/lib/ai/goals";
export { getBusinessContext, formatBusinessContextPrompt } from "@/lib/ai/context";
export type { BusinessContext } from "@/lib/ai/context";
export { generateMarketingStrategy } from "@/lib/ai/strategy";
export { generateContent } from "@/lib/ai/content";
export { generateContentPackage, AI_DECIDE } from "@/lib/ai/studio";
export {
  rewriteContent,
  generateVariations,
  repurposeContent,
  REWRITE_ACTIONS,
  ACTION_LABELS,
} from "@/lib/ai/rewrite";
export type { RewriteAction } from "@/lib/ai/rewrite";
export { generateWeeklyPlan } from "@/lib/ai/weekly";
export { generateCampaign } from "@/lib/ai/campaign";
export { recommendMedia } from "@/lib/ai/media";
export { assessMediaQuality, assessMediaList } from "@/lib/ai/media-quality";
export { buildFatigueSignals } from "@/lib/ai/fatigue";
export { analysePerformance } from "@/lib/ai/insights";
export { generateWeeklyReview } from "@/lib/ai/weekly-review";
export { validateContent } from "@/lib/ai/validate";
export { interpretAssistantRequest } from "@/lib/ai/assistant";
export { recordAiGeneration } from "@/lib/ai/history";
export { requireOrgAccess } from "@/lib/ai/auth";
export { hasOpenAIKey, getAiProviderHealth } from "@/lib/ai/model";
export type { AiProviderHealth, AiFallbackReason } from "@/lib/ai/model";
