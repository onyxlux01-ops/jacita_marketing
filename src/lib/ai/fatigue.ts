import type { BusinessContext } from "@/lib/ai/context";

export type FatigueSignals = {
  usedHooks: string[];
  usedTitles: string[];
  usedServices: string[];
  usedTypes: string[];
  usedMediaIds: string[];
  guidance: string;
};

export function buildFatigueSignals(ctx: BusinessContext): FatigueSignals {
  const usedHooks = ctx.recentContent
    .map((c) => c.hook)
    .filter((h): h is string => Boolean(h))
    .slice(0, 12);
  const usedTitles = ctx.recentContent
    .map((c) => c.title)
    .filter((t): t is string => Boolean(t))
    .slice(0, 12);
  const usedTypes = ctx.recentContent
    .map((c) => c.content_type)
    .filter((t): t is string => Boolean(t));
  const usedServices = ctx.services
    .filter((s) =>
      ctx.recentContent.some(
        (c) =>
          (c.caption || "").toLowerCase().includes(s.name.toLowerCase()) ||
          (c.title || "").toLowerCase().includes(s.name.toLowerCase())
      )
    )
    .map((s) => s.name);
  const usedMediaIds = ctx.media
    .filter((m) => m.is_favourite === false)
    .slice(0, 0)
    .map((m) => m.id);

  const typeCounts = usedTypes.reduce<Record<string, number>>((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const heavyTypes = Object.entries(typeCounts)
    .filter(([, n]) => n >= 2)
    .map(([t]) => t);

  const guidance = [
    usedHooks.length
      ? `Avoid reusing these recent hooks: ${usedHooks.slice(0, 5).join(" | ")}`
      : null,
    heavyTypes.length
      ? `Recent posts overuse: ${heavyTypes.join(", ")} — vary format.`
      : null,
    usedServices.length
      ? `Recently featured services: ${usedServices.join(", ")} — vary angle/story if repeating.`
      : null,
    "Vary educational, promotional, social proof, behind-the-scenes, and community angles.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    usedHooks,
    usedTitles,
    usedServices,
    usedTypes,
    usedMediaIds,
    guidance,
  };
}
