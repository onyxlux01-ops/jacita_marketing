import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBusinessContext,
  generateMarketingStrategy,
  generateContent,
  analysePerformance,
  recordAiGeneration,
  goalLabel,
  mapLegacyObjective,
} from "@/lib/ai";
import { enqueuePublishJobsForContent } from "@/lib/social/scheduler";
import { buildFatigueSignals } from "@/lib/ai/fatigue";
import {
  ensureAutomationSettings,
  getAutomationSettings,
  logAutomationActivity,
  setAutomationState,
  type AutomationMode,
  type AutomationSettings,
} from "@/lib/automation/settings";
import {
  isQuietHour,
  validateAutomationAction,
} from "@/lib/automation/guardrails";
import { freedomGuidance } from "@/lib/automation/control";
import { notifyAutomationIssue } from "@/lib/automation/notify";
import type { Json } from "@/lib/database.types";
import type { SocialPlatform } from "@/lib/types";
import type { AiFreedomLevel } from "@/lib/automation/settings";

type Admin = ReturnType<typeof createAdminClient>;

async function resolveActorId(admin: Admin, organisationId: string) {
  const { data: owner } = await admin
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", organisationId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return owner?.user_id ?? null;
}

async function createTask(
  admin: Admin,
  input: {
    organisationId: string;
    runId: string;
    taskType: string;
    decision?: Json;
  }
) {
  const { data } = await admin
    .from("automation_tasks")
    .insert({
      organisation_id: input.organisationId,
      run_id: input.runId,
      task_type: input.taskType,
      status: "pending",
      decision: input.decision ?? {},
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function completeTask(
  admin: Admin,
  taskId: string,
  status: "completed" | "failed" | "skipped",
  result: Json = {},
  errorMessage?: string
) {
  await admin
    .from("automation_tasks")
    .update({
      status,
      result,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .eq("id", taskId);
}

async function countPipeline(
  admin: Admin,
  organisationId: string,
  horizonDays: number
) {
  const until = new Date(
    Date.now() + horizonDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const { count } = await admin
    .from("content")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .in("status", ["draft", "review", "approved", "scheduled"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${until}`);
  return count ?? 0;
}

async function countPublishedToday(admin: Admin, organisationId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from("content")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("status", "published")
    .gte("published_at", start.toISOString());
  return count ?? 0;
}

function preferenceToContentType(prefs: string[], index: number) {
  const mix = [
    "educational",
    "promotional",
    "behind_the_scenes",
    "service_spotlight",
    "community",
    "reel",
    "image_post",
  ];
  if (prefs.includes("educational") && index % 3 === 0) return "educational";
  if (prefs.includes("behind_the_scenes") && index % 5 === 2) {
    return "behind_the_scenes";
  }
  if (prefs.includes("services") && index % 2 === 1) return "service_spotlight";
  return mix[index % mix.length];
}

function pickPlatform(platforms: string[], index: number): SocialPlatform {
  const allowed = platforms.filter((p) =>
    ["instagram", "facebook", "tiktok"].includes(p)
  ) as SocialPlatform[];
  if (!allowed.length) return "instagram";
  return allowed[index % allowed.length];
}

/**
 * Full autopilot loop for one organisation.
 * AI decides → structured actions → server validation → execute → log.
 */
export async function runAutomationForOrganisation(input: {
  organisationId: string;
  trigger?: "cron" | "manual" | "start" | "resume";
  actorUserId?: string | null;
}) {
  const admin = createAdminClient();
  const organisationId = input.organisationId;
  const trigger = input.trigger ?? "cron";
  let actionsTaken = 0;
  const errors: string[] = [];

  const settings = await ensureAutomationSettings(admin, organisationId);

  if (!settings.enabled || settings.mode === "off") {
    return {
      skipped: true,
      reason: "Automation is off",
      organisationId,
    };
  }

  if (settings.paused && trigger !== "resume" && trigger !== "start") {
    await logAutomationActivity(admin, {
      organisationId,
      eventType: "paused",
      message: "Automation is paused — no automated actions.",
      severity: "warning",
    });
    return { skipped: true, reason: "paused", organisationId };
  }

  const quiet = settings.quiet_hours as { start?: string; end?: string };
  if (trigger === "cron" && isQuietHour(quiet)) {
    return { skipped: true, reason: "quiet_hours", organisationId };
  }

  const actorId =
    input.actorUserId || (await resolveActorId(admin, organisationId));
  if (!actorId) {
    return {
      skipped: true,
      reason: "No owner found for authorization context",
      organisationId,
    };
  }

  const { data: run, error: runError } = await admin
    .from("automation_runs")
    .insert({
      organisation_id: organisationId,
      trigger,
      status: "running",
      metadata: { mode: settings.mode },
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: runError?.message || "Could not start run", organisationId };
  }

  const runId = run.id;

  await admin
    .from("automation_settings")
    .update({
      paused: trigger === "resume" || trigger === "start" ? false : settings.paused,
      last_run_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("organisation_id", organisationId);

  await setAutomationState(admin, organisationId, "starting", "Automation run started");
  await logAutomationActivity(admin, {
    organisationId,
    runId,
    eventType: "run_started",
    message: `Automation run started (${trigger}).`,
    severity: "info",
  });

  try {
    // 1) READ CONTEXT
    await setAutomationState(admin, organisationId, "analysing", "Reading business context");
    const context = await getBusinessContext(admin as never, organisationId, {
      requireAccess: false,
    });
    if (!context) {
      throw new Error("Could not load business context");
    }

    const fatigue = buildFatigueSignals(context);
    const goalKey = mapLegacyObjective(
      settings.primary_goals[0] || context.primaryGoalKey || "increase_brand_awareness"
    );

    // 2) PERFORMANCE / LEARNING
    const analysisTask = await createTask(admin, {
      organisationId,
      runId,
      taskType: "performance_analysis",
      decision: { action: "analyse_performance", reason: "Daily learning pass" },
    });
    await setAutomationState(admin, organisationId, "learning", "Analysing recent performance");
    let learningNote = "Not enough performance history yet.";
    try {
      const insights = await analysePerformance({
        context,
        requestText: "What should marketing automation do next?",
      });
      if (insights.ok) {
        learningNote =
          insights.data.insights?.[0]?.text ||
          insights.data.summary ||
          learningNote;
        await recordAiGeneration(admin as never, {
          organisationId,
          userId: actorId,
          generationType: "insights",
          requestText: "automation learning",
          inputContext: { run_id: runId },
          outputPayload: insights.data as unknown as Json,
          status: insights.demo ? "fallback" : "success",
          model: insights.model,
        });
        await logAutomationActivity(admin, {
          organisationId,
          runId,
          eventType: "learning",
          message: learningNote.slice(0, 240),
          severity: "success",
          metadata: {
            confidence: insights.data.insights?.[0]?.confidence || null,
            evidence: insights.data.summary?.slice(0, 200) || null,
          },
        });
        actionsTaken += 1;
      }
      if (analysisTask) await completeTask(admin, analysisTask, "completed", { learningNote });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      errors.push(msg);
      if (analysisTask) await completeTask(admin, analysisTask, "failed", {}, msg);
    }

    const freedom = (settings.ai_freedom_level ||
      "balanced") as AiFreedomLevel;
    const freedomNote = freedomGuidance(freedom);

    // Recent human rejections — avoid regenerating the same ideas
    const { data: rejectionRows } = await admin
      .from("automation_activity")
      .select("metadata, message")
      .eq("organisation_id", organisationId)
      .eq("event_type", "content_rejected")
      .order("created_at", { ascending: false })
      .limit(15);
    const rejectionHints = (rejectionRows ?? [])
      .map((r) => {
        const meta =
          r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
            ? (r.metadata as Record<string, unknown>)
            : {};
        return String(meta.hook || meta.title || r.message || "").slice(0, 80);
      })
      .filter(Boolean)
      .slice(0, 8);

    // 3) STRATEGY UPDATE
    const strategyTask = await createTask(admin, {
      organisationId,
      runId,
      taskType: "strategy_update",
      decision: {
        action: "update_strategy",
        reason: learningNote,
      },
    });
    await setAutomationState(admin, organisationId, "planning", "Updating marketing strategy");
    await admin
      .from("automation_settings")
      .update({
        next_planned_action: "Creating this week's content",
      })
      .eq("organisation_id", organisationId);
    let strategySummary = "";
    try {
      const strategy = await generateMarketingStrategy({
        context,
        goalKey,
        requestText: `Automation strategy. Learning: ${learningNote}. Fatigue: ${fatigue.guidance}. Freedom: ${freedomNote}. Avoid repeating rejected ideas: ${rejectionHints.join("; ") || "none"}.`,
      });
      if (strategy.ok) {
        strategySummary = strategy.data.rationale || strategy.data.title;
        const decisionPayload = {
          decision: strategy.data.title,
          why: strategy.data.rationale || learningNote,
          action:
            strategy.data.content_themes?.[0]
              ? `Focus themes: ${strategy.data.content_themes.slice(0, 3).join(", ")}`
              : strategy.data.posting_frequency || "Continue planned mix",
          confidence: freedom === "conservative" ? "measured" : "adaptive",
        };
        await admin
          .from("automation_settings")
          .update({
            latest_decision: decisionPayload as unknown as Json,
            next_planned_action: "Generating content for the pipeline",
          })
          .eq("organisation_id", organisationId);

        await admin.from("marketing_strategies").insert({
          organisation_id: organisationId,
          title: strategy.data.title,
          primary_objective: strategy.data.primary_objective,
          target_audience: strategy.data.target_audience,
          key_message: strategy.data.key_message,
          services_to_promote: strategy.data.services_to_promote,
          content_themes: strategy.data.content_themes,
          recommended_platforms: strategy.data.recommended_platforms,
          recommended_content_types: strategy.data.recommended_content_types,
          posting_frequency: strategy.data.posting_frequency,
          campaign_duration: strategy.data.campaign_duration,
          calls_to_action: strategy.data.calls_to_action,
          content_mix: strategy.data.content_mix,
          strategy_payload: strategy.data as unknown as Json,
          created_by: actorId,
        });
        await logAutomationActivity(admin, {
          organisationId,
          runId,
          eventType: "strategy",
          message: `AI updated strategy: ${strategy.data.title}`,
          severity: "success",
        });
        actionsTaken += 1;
      }
      if (strategyTask) {
        await completeTask(admin, strategyTask, "completed", {
          title: strategy.ok ? strategy.data.title : null,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Strategy failed";
      errors.push(msg);
      if (strategyTask) await completeTask(admin, strategyTask, "failed", {}, msg);
    }

    // 4) PIPELINE CHECK
    const needed =
      Math.max(1, Math.ceil(settings.posts_per_week / 7) * settings.pipeline_horizon_days);
    const currentPipeline = await countPipeline(
      admin,
      organisationId,
      settings.pipeline_horizon_days
    );
    const deficit = Math.max(0, needed - currentPipeline);

    await logAutomationActivity(admin, {
      organisationId,
      runId,
      eventType: "pipeline_check",
      message: `Pipeline has ${currentPipeline} upcoming items; target ~${needed} (${deficit} to create).`,
    });

    // 5) CONTENT GENERATION (only if needed — cost control)
    if (deficit > 0 && settings.mode !== "manual") {
      await setAutomationState(
        admin,
        organisationId,
        "creating",
        `Creating ${Math.min(deficit, 5)} content items`
      );

      const genCount = Math.min(deficit, 5);
      for (let i = 0; i < genCount; i++) {
        const platform = pickPlatform(settings.platforms, i);
        const contentType = preferenceToContentType(
          settings.content_preferences,
          i + currentPipeline
        );
        const service =
          context.services.find((s) => s.is_featured) ||
          context.services[i % Math.max(1, context.services.length)] ||
          null;

        const decision = {
          action: "generate_content" as const,
          platform,
          reason: `Fill pipeline with ${contentType} for ${goalLabel(goalKey)}`,
        };
        const gate = validateAutomationAction(decision, {
          mode: settings.mode,
          paused: false,
          enabled: true,
          organisationId,
          platformsAllowed: settings.platforms,
        });
        if (!gate.ok) {
          await logAutomationActivity(admin, {
            organisationId,
            runId,
            eventType: "guardrail",
            message: gate.reason,
            severity: "warning",
          });
          continue;
        }

        const taskId = await createTask(admin, {
          organisationId,
          runId,
          taskType: "content_generation",
          decision,
        });

        try {
          const generated = await generateContent({
            context,
            platform,
            contentType,
            goalKey,
            productServiceId: service?.id,
            notes: `Automation. Strategy: ${strategySummary}. ${fatigue.guidance}. Freedom: ${freedomNote}. Do not reuse rejected hooks: ${rejectionHints.join(" | ") || "none"}`,
            strategySummary,
          });

          if (!generated.ok) {
            if (taskId) {
              await completeTask(admin, taskId, "failed", {}, generated.error);
            }
            errors.push(generated.error);
            continue;
          }

          await recordAiGeneration(admin as never, {
            organisationId,
            userId: actorId,
            generationType: "content",
            requestText: decision.reason,
            inputContext: { run_id: runId, platform, content_type: contentType },
            outputPayload: generated.data as unknown as Json,
            status: generated.demo ? "fallback" : "success",
            model: generated.model,
          });

          // Validate
          await setAutomationState(
            admin,
            organisationId,
            "validating",
            "Validating generated content"
          );
          const validation = generated.data.validation;
          if (validation && (!validation.passed || validation.score < 55)) {
            await logAutomationActivity(admin, {
              organisationId,
              runId,
              eventType: "validation_failed",
              message: `Content flagged: ${validation.summary}`,
              severity: "warning",
            });
            // Still save as draft/review for human — never publish invalid
          }

          const status =
            settings.mode === "approval"
              ? "review"
              : settings.mode === "autopilot"
                ? validation && validation.passed
                  ? "approved"
                  : "review"
                : "draft";

          const mediaId = generated.data.selectedMediaId;
          if (!mediaId && generated.data.content.media_needed_message) {
            await logAutomationActivity(admin, {
              organisationId,
              runId,
              eventType: "media_required",
              message: generated.data.content.media_needed_message,
              severity: "warning",
            });
          } else if (mediaId) {
            await logAutomationActivity(admin, {
              organisationId,
              runId,
              eventType: "media_selected",
              message: `AI selected media ${mediaId.slice(0, 8)}…`,
            });
          }

          const scheduledAt =
            generated.data.content.suggested_posting_time ||
            new Date(
              Date.now() + (i + 1) * 26 * 60 * 60 * 1000
            ).toISOString();

          const { data: contentRow, error: contentError } = await admin
            .from("content")
            .insert({
              organisation_id: organisationId,
              product_service_id: service?.id || null,
              media_asset_id: mediaId,
              title: generated.data.content.title,
              idea: generated.data.content.idea,
              hook: generated.data.content.hook,
              caption: generated.data.content.caption,
              call_to_action: generated.data.content.call_to_action,
              hashtags: generated.data.content.hashtags,
              suggested_posting_time: scheduledAt,
              video_concept: generated.data.content.video_concept,
              on_screen_text: generated.data.content.on_screen_text ?? null,
              voiceover_script:
                generated.data.content.voiceover_script ?? null,
              alt_text: generated.data.content.alt_text ?? null,
              posting_recommendation:
                generated.data.content.posting_recommendation ?? null,
              content_type: contentType,
              marketing_objective: goalKey,
              tone: context.brand?.tone || null,
              quality_score: validation?.score ?? null,
              quality_flags: (validation?.flags || []) as unknown as Json,
              status,
              scheduled_at:
                status === "approved" ? scheduledAt : null,
              generation_payload: {
                automation: true,
                run_id: runId,
                validation,
                reason: decision.reason,
              },
              created_by: actorId,
            })
            .select("id")
            .single();

          if (contentError || !contentRow) {
            if (taskId) {
              await completeTask(
                admin,
                taskId,
                "failed",
                {},
                contentError?.message
              );
            }
            errors.push(contentError?.message || "Content insert failed");
            continue;
          }

          await admin.from("content_platforms").insert({
            content_id: contentRow.id,
            platform,
          });

          await admin.from("content_events").insert({
            organisation_id: organisationId,
            content_id: contentRow.id,
            event_type: "created",
            actor_id: actorId,
            summary: "Created by marketing automation",
            metadata: { run_id: runId },
          });

          await logAutomationActivity(admin, {
            organisationId,
            runId,
            eventType: "content_created",
            message: `AI created ${platform} ${contentType}: ${generated.data.content.title}`,
            severity: "success",
            metadata: { content_id: contentRow.id },
          });

          // Schedule when approval or autopilot and content validated
          if (
            (settings.mode === "autopilot" || settings.mode === "approval") &&
            status !== "draft" &&
            status !== "review"
          ) {
            await setAutomationState(
              admin,
              organisationId,
              "scheduling",
              "Scheduling content"
            );
            const scheduleDecision = {
              action: "schedule_post" as const,
              platform,
              content_id: contentRow.id,
              scheduled_time: scheduledAt,
              reason: generated.data.content.posting_recommendation || "AI schedule",
            };
            const scheduleGate = validateAutomationAction(scheduleDecision, {
              mode: settings.mode,
              paused: false,
              enabled: true,
              organisationId,
              contentOrganisationId: organisationId,
              platformsAllowed: settings.platforms,
            });
            if (scheduleGate.ok) {
              await admin
                .from("content")
                .update({ status: "scheduled", scheduled_at: scheduledAt })
                .eq("id", contentRow.id)
                .eq("organisation_id", organisationId);

              await enqueuePublishJobsForContent({
                contentId: contentRow.id,
                organisationId,
                scheduledAt,
                userId: actorId,
              });

              await logAutomationActivity(admin, {
                organisationId,
                runId,
                eventType: "scheduled",
                message: `AI scheduled ${platform} post for ${new Date(scheduledAt).toLocaleString()}`,
                severity: "success",
              });
              actionsTaken += 1;
            }
          } else if (settings.mode === "approval") {
            await logAutomationActivity(admin, {
              organisationId,
              runId,
              eventType: "needs_approval",
              message: `Content requires approval: ${generated.data.content.title}`,
              severity: "warning",
              metadata: { content_id: contentRow.id },
            });
          }

          if (taskId) {
            await completeTask(admin, taskId, "completed", {
              content_id: contentRow.id,
              status,
            });
          }
          actionsTaken += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Generation failed";
          errors.push(msg);
          if (taskId) await completeTask(admin, taskId, "failed", {}, msg);
        }
      }
    } else if (settings.mode === "manual") {
      await logAutomationActivity(admin, {
        organisationId,
        runId,
        eventType: "manual_mode",
        message:
          "Manual mode — AI analysed and updated strategy only. No auto-create or publish.",
      });
    } else {
      await logAutomationActivity(admin, {
        organisationId,
        runId,
        eventType: "pipeline_ok",
        message: "Content pipeline is sufficiently populated. Skipped generation.",
      });
    }

    // 6) AUTOPILOT: auto-approve + schedule any approved backlog within daily cap
    if (settings.mode === "autopilot") {
      const publishedToday = await countPublishedToday(admin, organisationId);
      const remaining = Math.max(
        0,
        settings.max_auto_publishes_per_day - publishedToday
      );
      if (remaining > 0) {
        await setAutomationState(
          admin,
          organisationId,
          "publishing",
          "Checking autopilot publish queue"
        );
        const { data: ready } = await admin
          .from("content")
          .select("id, scheduled_at, content_platforms(platform)")
          .eq("organisation_id", organisationId)
          .eq("status", "approved")
          .order("suggested_posting_time", { ascending: true })
          .limit(remaining);

        for (const item of ready ?? []) {
          const when =
            item.scheduled_at ||
            new Date(Date.now() + 60 * 60 * 1000).toISOString();
          const platformsRaw = (
            item as {
              content_platforms?: Array<{ platform: SocialPlatform }> | null;
            }
          ).content_platforms;
          const platforms = (platformsRaw ?? []).map((p) => p.platform);
          if (!platforms.length) continue;

          const gate = validateAutomationAction(
            {
              action: "publish_post",
              content_id: item.id,
              platform: platforms[0],
              scheduled_time: when,
              reason: "Autopilot schedule approved content",
            },
            {
              mode: "autopilot",
              paused: false,
              enabled: true,
              organisationId,
              contentOrganisationId: organisationId,
              platformsAllowed: settings.platforms,
            }
          );
          if (!gate.ok) continue;

          await admin
            .from("content")
            .update({ status: "scheduled", scheduled_at: when })
            .eq("id", item.id);

          await enqueuePublishJobsForContent({
            contentId: item.id,
            organisationId,
            scheduledAt: when,
            userId: actorId,
          });

          await logAutomationActivity(admin, {
            organisationId,
            runId,
            eventType: "autopilot_queued",
            message: `Autopilot queued publish for ${platforms.join(", ")}`,
            severity: "success",
          });
          actionsTaken += 1;
        }
      }
    }

    await setAutomationState(
      admin,
      organisationId,
      "completed",
      errors.length
        ? `Completed with ${errors.length} issue(s)`
        : "Automation cycle complete"
    );

    await admin
      .from("automation_runs")
      .update({
        status: errors.length ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        actions_taken: actionsTaken,
        errors: errors as unknown as Json,
        summary: errors.length
          ? `Finished with errors: ${errors.slice(0, 2).join("; ")}`
          : `Completed ${actionsTaken} action(s). ${learningNote.slice(0, 120)}`,
      })
      .eq("id", runId);

    await admin
      .from("automation_settings")
      .update({
        last_success_at: errors.length ? settings.last_success_at : new Date().toISOString(),
        last_error: errors[0] || null,
        current_state: errors.length ? "error" : "completed",
      })
      .eq("organisation_id", organisationId);

    await logAutomationActivity(admin, {
      organisationId,
      runId,
      eventType: "run_completed",
      message: errors.length
        ? `Run finished with issues (${actionsTaken} actions).`
        : `Run completed — ${actionsTaken} actions taken.`,
      severity: errors.length ? "warning" : "success",
    });

    return {
      organisationId,
      runId,
      actionsTaken,
      errors,
      learningNote,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Automation failed";
    await setAutomationState(admin, organisationId, "error", message);
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        actions_taken: actionsTaken,
        errors: [message] as unknown as Json,
        summary: message,
      })
      .eq("id", runId);
    await admin
      .from("automation_settings")
      .update({ last_error: message, current_state: "error" })
      .eq("organisation_id", organisationId);
    await logAutomationActivity(admin, {
      organisationId,
      runId,
      eventType: "run_failed",
      message,
      severity: "error",
    });
    await notifyAutomationIssue({
      organisationId,
      title: "Automation failed",
      body: message.slice(0, 280),
    });
    return { organisationId, runId, error: message, actionsTaken };
  }
}

/**
 * Run automation for all enabled businesses (cron).
 * Each org is isolated — failures do not stop others.
 */
export async function runAutomationForAllEnabled() {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("automation_settings")
    .select("organisation_id")
    .eq("enabled", true)
    .eq("paused", false)
    .neq("mode", "off");

  const results = [];
  for (const row of rows ?? []) {
    try {
      const result = await runAutomationForOrganisation({
        organisationId: row.organisation_id,
        trigger: "cron",
      });
      results.push(result);
    } catch (e) {
      results.push({
        organisationId: row.organisation_id,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }
  return { processed: results.length, results };
}

export async function getOrgSetupReadiness(
  admin: Admin,
  organisationId: string
) {
  const [
    { data: org },
    { count: serviceCount },
    { count: mediaCount },
    { data: social },
    { data: goals },
  ] = await Promise.all([
    admin
      .from("organisations")
      .select("id, name, description, primary_marketing_goal_key")
      .eq("id", organisationId)
      .maybeSingle(),
    admin
      .from("products_services")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("is_active", true),
    admin
      .from("media_assets")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("is_active", true),
    admin
      .from("social_accounts")
      .select("platform, connection_status")
      .eq("organisation_id", organisationId),
    admin
      .from("marketing_goals")
      .select("goal_key")
      .eq("organisation_id", organisationId)
      .eq("status", "active"),
  ]);

  const connected = (social ?? []).filter(
    (s) => s.connection_status === "connected"
  );

  const checks = [
    {
      id: "business",
      label: "Business profile",
      ok: Boolean(org?.name),
    },
    {
      id: "goals",
      label: "Marketing goals",
      ok: Boolean(org?.primary_marketing_goal_key) || (goals?.length ?? 0) > 0,
    },
    {
      id: "services",
      label: "Services / products",
      ok: (serviceCount ?? 0) > 0,
    },
    {
      id: "media",
      label: "Media library",
      ok: (mediaCount ?? 0) > 0,
      optional: true,
    },
    {
      id: "social",
      label: "Connected social accounts",
      ok: connected.length > 0,
    },
  ];

  return {
    ready: checks.filter((c) => !("optional" in c && c.optional)).every((c) => c.ok),
    checks,
    connectedPlatforms: connected.map((c) => c.platform),
  };
}

export type { AutomationMode, AutomationSettings };
