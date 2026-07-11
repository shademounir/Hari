"use server";

import { APICallError, generateObject } from "ai";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getChatModel, DEFAULT_MODEL_ID } from "@/lib/ai/providers";

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-099 Increment 3 — server actions for the engagement dashboards.
// ─────────────────────────────────────────────────────────────────────────

function classifyAiError(err: unknown): "rate_limited" | "ai_unavailable" {
  if (APICallError.isInstance(err) && (err.statusCode === 429 || err.isRetryable)) {
    return err.statusCode === 429 ? "rate_limited" : "ai_unavailable";
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|too many requests/i.test(msg) ? "rate_limited" : "ai_unavailable";
}

const startOfMonthUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
};

// ── 1. Qualitative manager input ─────────────────────────────────────────

export type QualitativeInput = {
  employeeId: string;
  workQuality: number;
  participation: number;
  peerInteraction: number;
  note?: string | null;
};
export type QualitativeResult = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "internal" };

const rating = z.number().int().min(1).max(5);
const QualitativeSchema = z.object({
  employeeId: z.string().min(1),
  workQuality: rating,
  participation: rating,
  peerInteraction: rating,
  note: z.string().trim().max(500).nullish(),
});

/**
 * Save/replace a manager's monthly qualitative rating for one report. Gated on
 * `engagement:input` AND ownership: a manager may only rate their OWN direct
 * reports (HR may rate anyone); no one may rate themselves. Attributed to the
 * rater + month (upsert), so a successor manager never overwrites prior history.
 */
export async function saveQualitativeSignalAction(input: QualitativeInput): Promise<QualitativeResult> {
  const user = await requireUser();
  if (!can(user.role, "engagement:input")) return { ok: false, error: "forbidden" };

  const parsed = QualitativeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { employeeId, workQuality, participation, peerInteraction, note } = parsed.data;

  // employeeId is resolved live from the DB in the auth session callback
  // (lib/auth.ts), so the session value is already current.
  if (user.employeeId && employeeId === user.employeeId) return { ok: false, error: "forbidden" }; // no self-rating

  // Ownership: HR/Admin (engagement:read:all) may rate anyone; a manager only their reports.
  const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  if (!target) return { ok: false, error: "invalid" };
  const owns = can(user.role, "engagement:read:all") || target.managerId === user.employeeId;
  if (!owns) return { ok: false, error: "forbidden" };

  try {
    const period = startOfMonthUTC();
    await prisma.qualitativeSignal.upsert({
      where: { employeeId_raterId_period: { employeeId, raterId: user.id, period } },
      create: { employeeId, raterId: user.id, period, workQuality, participation, peerInteraction, note: note ?? null },
      update: { workQuality, participation, peerInteraction, note: note ?? null },
    });
    revalidatePath("/team/engagement");
    return { ok: true };
  } catch (err) {
    console.error("[engagement] save qualitative failed:", err);
    return { ok: false, error: "internal" };
  }
}

// ── 2. Generative 1:1 support agenda ─────────────────────────────────────

const SupportAgendaSchema = z.object({
  openingTone: z.string().describe("One or two sentences: a warm, non-accusatory way to open the 1:1."),
  discussionTopics: z
    .array(z.object({ topic: z.string(), why: z.string() }))
    .min(2)
    .max(4)
    .describe("Topics tied to the specific failing signals, framed supportively."),
  suggestedQuestions: z.array(z.string()).min(2).max(4).describe("Open-ended, non-leading questions."),
  supportiveActions: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("Concrete supportive actions — load reduction for burnout, growth/challenge for boreout."),
  whatNotToSay: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("Phrases the manager must AVOID (e.g. 'our AI flagged you', anything accusatory or surveillance-like)."),
  followUpInDays: z.number().int().min(1).max(90),
});
export type SupportAgenda = z.infer<typeof SupportAgendaSchema>;

export type AgendaInput = { quadrant: string; band: string; topFactors: string[] };
export type AgendaResult =
  | { ok: true; agenda: SupportAgenda }
  | { ok: false; error: "forbidden" | "invalid" | "rate_limited" | "ai_unavailable" };

const AgendaInputSchema = z.object({
  quadrant: z.enum(["ENGAGED", "BURNOUT", "BOREOUT", "STRAINED"]),
  band: z.enum(["GREEN", "YELLOW", "ORANGE", "RED"]),
  topFactors: z.array(z.string().max(40)).max(6),
});

/**
 * Generate a supportive, structured 1:1 agenda from the FAILING SIGNALS + quadrant
 * only — never a name or raw value (privacy-safe). Gated on `engagement:read:team`.
 * The prompt hard-codes the "supportive not punitive" rule and a `whatNotToSay`
 * guardrail so the tool can't be weaponized.
 */
export async function generateSupportAgendaAction(input: AgendaInput): Promise<AgendaResult> {
  const user = await requireUser();
  if (!can(user.role, "engagement:read:team")) return { ok: false, error: "forbidden" };

  const parsed = AgendaInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { quadrant, band, topFactors } = parsed.data;

  const locale = await getLocale();
  const quadrantGuidance: Record<string, string> = {
    BURNOUT: "This person shows BURNOUT (high exhaustion). Prioritize REDUCING load, protecting recovery, and redistributing work. Never suggest they 'push through'.",
    BOREOUT: "This person shows BOREOUT (under-stimulated). Prioritize ADDING challenge, growth, ownership, and new scope — not rest.",
    STRAINED: "This person is STRAINED (overloaded but still engaged). Protect focus time and remove blockers before it becomes burnout.",
    ENGAGED: "This person looks engaged; keep the 1:1 light and appreciative.",
  };

  const prompt = [
    "You are an empathetic HR coach helping a manager prepare a SUPPORTIVE 1:1.",
    "The goal is to OFFER SUPPORT and understand, never to blame, discipline, or surveil.",
    `Engagement band: ${band}. 2-D quadrant: ${quadrant}. ${quadrantGuidance[quadrant]}`,
    `The signals that pulled the score down (factor keys): ${topFactors.join(", ") || "none specific"}.`,
    "Build the agenda around those specific signals, but frame everything humanely.",
    "In whatNotToSay, explicitly warn the manager NOT to mention any AI/score/algorithm, NOT to accuse, and NOT to frame the conversation as performance management.",
    `Write all human-readable text in locale "${locale}".`,
  ].join("\n");

  try {
    const { object } = await generateObject({
      model: getChatModel(DEFAULT_MODEL_ID),
      schema: SupportAgendaSchema,
      // Keeps output short + valid: concise lists + an explicit "finish the JSON"
      // instruction so the model doesn't get truncated mid-string.
      system:
        "You are an empathetic HR coach helping a manager prepare a supportive 1:1. " +
        "Generate extremely concise, bulleted lists. You must complete the JSON object. " +
        "Do not exceed 800 words of output.",
      prompt,
      // temperature 0 → deterministic, far fewer structural JSON errors.
      temperature: 0,
      // Cap the output budget so OpenRouter doesn't reserve the model's full
      // context (which caused "requested 65535 tokens, can only afford ...").
      // v6 uses `maxOutputTokens` (the old `maxTokens` name is a no-op here).
      // 1000 gives the agenda room without letting it write a novel.
      maxOutputTokens: 1000,
    });
    return { ok: true, agenda: object };
  } catch (err) {
    console.error("[engagement] support agenda failed:", err);
    return { ok: false, error: classifyAiError(err) };
  }
}
