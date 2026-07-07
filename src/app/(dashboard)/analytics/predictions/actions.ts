"use server";

import { APICallError, generateObject } from "ai";
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getChatModel, DEFAULT_MODEL_ID } from "@/lib/ai/providers";
import {
  SENIORITY_LEVELS,
  URGENCY_LEVELS,
  type Seniority,
  type Urgency,
} from "./simulator-constants";

// Structured recruitment plan the model must return. Kept flat + typed so the UI
// renders it deterministically (no free-form parsing). No salary is ever sent to
// the model — costs are market estimates, not derived from real compensation.
const PlanSchema = z.object({
  summary: z.string().describe("One or two sentences framing the backfill plan."),
  profiles: z
    .array(
      z.object({
        title: z.string(),
        count: z.number().int().min(1),
        seniority: z.enum(["JUNIOR", "MID", "SENIOR", "LEAD"]),
        rationale: z.string(),
      }),
    )
    .min(1),
  estimatedTimeToHireWeeks: z.number().int().min(1).max(104),
  estimatedCost: z.object({
    currency: z.string(),
    amount: z.number().int().min(0).describe("Total estimated hiring cost (fees + onboarding)."),
    notes: z.string().nullable(),
  }),
  budgetAssessment: z
    .string()
    .describe("How the plan fits (or strains) the stated budget, and any trade-offs made."),
  fitsBudget: z.boolean().describe("Whether the estimated cost stays within the stated budget."),
  risks: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type RecruitmentPlan = z.infer<typeof PlanSchema>;

export type SimulateInput = {
  department: string;
  count: number;
  seniority: Seniority;
  budget: number;
  urgency: Urgency;
};
export type SimulateError = "forbidden" | "invalid" | "rate_limited" | "ai_unavailable";
export type SimulateResult =
  | { ok: true; plan: RecruitmentPlan }
  | { ok: false; error: SimulateError };

/**
 * Map a generation failure to a client error code. An upstream 429 (provider rate
 * limit — the "Too Many Requests" seen in the terminal) becomes `rate_limited` so
 * the UI can tell the user to retry shortly; anything else is `ai_unavailable`.
 */
function classifyAiError(err: unknown): SimulateError {
  if (APICallError.isInstance(err) && (err.statusCode === 429 || err.isRetryable)) {
    return err.statusCode === 429 ? "rate_limited" : "ai_unavailable";
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|too many requests/i.test(msg) ? "rate_limited" : "ai_unavailable";
}

const InputSchema = z.object({
  department: z.string().trim().min(1).max(80),
  count: z.number().int().min(1).max(50),
  seniority: z.enum(SENIORITY_LEVELS),
  budget: z.number().int().min(0).max(100_000_000),
  urgency: z.enum(URGENCY_LEVELS),
});

/**
 * What-if simulator: "if N people leave department D, what's the backfill plan?"
 * Gated to the same HR/Admin capability as the dashboard (defense in depth). Uses
 * the org's configured currency so the estimate is presented sensibly. Fails soft
 * (typed error) so the client can show a friendly message instead of a crash.
 */
export async function simulateRecruitmentAction(input: SimulateInput): Promise<SimulateResult> {
  const user = await requireUser();
  if (!can(user.role, "dashboard:read:company")) return { ok: false, error: "forbidden" };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { department, count, seniority, budget, urgency } = parsed.data;

  const [settings, locale] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { id: "singleton" }, select: { currency: true } }),
    getLocale(),
  ]);
  const currency = settings?.currency ?? "USD";

  const urgencyGuidance: Record<Urgency, string> = {
    NORMAL: "Standard timeline — optimize for quality of hire and cost efficiency.",
    HIGH: "Time-sensitive — favor faster channels (agencies, referrals) even at higher cost; compress the timeline.",
    CRITICAL: "Business-critical backfill — prioritize speed above all; consider contractors/interim cover to bridge gaps, and flag the cost premium.",
  };

  const prompt = [
    `You are an HR workforce-planning assistant for a company.`,
    `Scenario: ${count} employee(s) at the ${seniority} level are expected to leave the "${department}" department in the near term.`,
    `Produce a concrete, tailored backfill / recruitment plan to maintain capacity.`,
    `Target seniority for the backfill: ${seniority}. Skew the profiles you propose toward this level (a Lead/Senior gap may need a mix, a Junior gap should stay lean).`,
    `Budget ceiling for the whole plan: ${budget.toLocaleString("en-US")} ${currency}. Keep the estimated cost within this budget where feasible; set fitsBudget accordingly and explain any trade-offs in budgetAssessment.`,
    `Urgency: ${urgency}. ${urgencyGuidance[urgency]} Reflect this in estimatedTimeToHireWeeks and the strategy.`,
    `Estimate costs in ${currency} using typical market rates (do NOT ask for or assume internal salaries).`,
    `Write all human-readable text in locale "${locale}".`,
  ].join("\n");

  try {
    const { object } = await generateObject({
      model: getChatModel(DEFAULT_MODEL_ID),
      schema: PlanSchema,
      prompt,
    });
    // Force the currency to the org's configured one regardless of what the model echoed.
    return { ok: true, plan: { ...object, estimatedCost: { ...object.estimatedCost, currency } } };
  } catch (err) {
    console.error("[simulate] recruitment plan failed:", err);
    return { ok: false, error: classifyAiError(err) };
  }
}
