// ─────────────────────────────────────────────────────────────────────────
// SCRUM-099 — Engagement DATA LAYER (server-only). Turns raw HR rows into the
// privacy-safe `EngagementInput` the pure scorer consumes, then orchestrates the
// daily run (EMA smoothing, momentum, confidence-gated alerts, de-dup).
//
// PRIVACY: derived signals only leave this layer — day counts, ratios, a 1:1 gap,
// aggregate qualitative ratings. No names, no notes. Snapshots/alerts inherit the
// AiEvent/Alert no-PII contract.
//
// COMPLIANCE (Moroccan Labor Code): absenteeism signals STRICTLY exclude protected
// leave — Sick (Maladie), Personal / family events (Événements familiaux), and
// (when modeled) Maternity/Paternity. The model must never penalize a protected
// absence — see PROTECTED_LEAVE_TYPES.
//
// PERFORMANCE: every signal is batch-loaded across all active employees (grouped
// queries + `in` lists), never per-employee — no N+1.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import type { LeaveType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/alerts";
import { can, type Role } from "@/lib/rbac";
import {
  computeEngagement,
  DEFAULT_ENGAGEMENT_CONFIG,
  MIN_TENURE_DAYS,
  type Confidence,
  type EngagementBand,
  type EngagementConfig,
  type EngagementFactor,
  type EngagementInput,
  type EngagementQuadrant,
  type EngagementThresholds,
  type EngagementWeights,
} from "./engagement";

// ── Tunables ────────────────────────────────────────────────────────────────

/**
 * Protected leave that must NEVER count toward absenteeism (labor-law compliance).
 * The schema models VACATION | SICK | PERSONAL; SICK (Maladie) and PERSONAL
 * (Événements familiaux) are protected. If Maternity/Paternity is added to the
 * LeaveType enum later, add it here too.
 */
const PROTECTED_LEAVE_TYPES: LeaveType[] = ["SICK", "PERSONAL"];

const DAY_MS = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = DAY_MS * (365.25 / 12);

const RECENT_DAYS = 90; // trailing window for absence
const AI_RECENT_DAYS = 30; // trailing window for assistant usage
const UNPLANNED_LEAD_DAYS = 3; // leave requested <3 days out = "unplanned"
const EMA_ALPHA = 0.3; // smoothing factor (~a working week of memory)
const MOMENTUM_WINDOW_DAYS = 28; // trailing window for the velocity slope

// ── Small date helpers ──────────────────────────────────────────────────────

const daysBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
const monthsBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
const shiftDays = (d: Date, days: number) => new Date(d.getTime() - days * DAY_MS);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ── Active config (mirrors SCRUM-098 getActiveModelConfig) ───────────────────

export type ActiveEngagementConfig = { config: EngagementConfig; version: number };

/**
 * The active, HR-recalibrated coefficients — or the built-in defaults (version 0)
 * when no config row exists. JSON columns are validated loosely and any missing
 * key falls back to its default, so a partial/legacy row can't NaN a score.
 */
export async function getActiveEngagementConfig(): Promise<ActiveEngagementConfig> {
  const row = await prisma.engagementSignalConfig.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
    select: { version: true, baseline: true, weights: true, thresholds: true },
  });
  if (!row) return { config: DEFAULT_ENGAGEMENT_CONFIG, version: 0 };

  const w = (row.weights ?? {}) as Partial<Record<keyof EngagementWeights, number>>;
  const t = (row.thresholds ?? {}) as Partial<EngagementThresholds>;
  const weights = { ...DEFAULT_ENGAGEMENT_CONFIG.weights };
  for (const k of Object.keys(weights) as (keyof EngagementWeights)[]) {
    if (typeof w[k] === "number") weights[k] = w[k] as number;
  }
  const d = DEFAULT_ENGAGEMENT_CONFIG.thresholds;
  const thresholds: EngagementThresholds = {
    greenMin: typeof t.greenMin === "number" ? t.greenMin : d.greenMin,
    yellowMin: typeof t.yellowMin === "number" ? t.yellowMin : d.yellowMin,
    orangeMin: typeof t.orangeMin === "number" ? t.orangeMin : d.orangeMin,
  };
  const baseline = typeof row.baseline === "number" ? row.baseline : DEFAULT_ENGAGEMENT_CONFIG.baseline;
  return { config: { baseline, weights, thresholds }, version: row.version };
}

// ── Two-tier baseline ────────────────────────────────────────────────────────

/**
 * Personal baseline once the employee has ≥6 weeks tenure AND a personal figure;
 * otherwise fall back to the department/cohort average (or null if neither exists).
 * This stops new hires being scored against a baseline they can't have.
 */
function resolveBaseline(
  personal: number | null,
  cohort: number | null,
  tenureDays: number,
): number | null {
  if (tenureDays >= MIN_TENURE_DAYS && personal !== null) return personal;
  return cohort;
}

/** Absence spike vs baseline (0 = normal, 1 = double). Floors the denominator so a
 *  near-zero baseline can't over-penalize a single stray day. */
function absenceSpike(recentDays: number, baseline: number | null): number | null {
  if (baseline === null) return null;
  return clamp((recentDays - baseline) / Math.max(baseline, 1), 0, 3);
}

/** Fractional drop in assistant usage. `null` when the baseline is zero (you can't
 *  measure a "drop" from no usage — treated as no-data, not disengagement). */
function assistantDrop(recentTurns: number, baseline: number | null): number | null {
  if (baseline === null || baseline <= 0) return null;
  return clamp((baseline - recentTurns) / baseline, 0, 1);
}

// ── Batch signal aggregation ─────────────────────────────────────────────────

type EmployeeRow = {
  id: string;
  userId: string;
  department: string;
  startDate: Date;
  lastRoleChangeDate: Date | null;
  leaveBalances: { totalDays: number; usedDays: number }[]; // VACATION only
};

/** Everything the scorer needs for ONE employee, plus the ids the caller must keep. */
export type EngagementCandidate = {
  employeeId: string;
  userId: string;
  department: string;
  input: EngagementInput;
};

/**
 * Assemble `EngagementInput` for every ACTIVE employee. All reads are batched.
 * Cohort (department) averages are computed once and used as the two-tier fallback.
 */
export async function buildEngagementCandidates(asOf: Date): Promise<EngagementCandidate[]> {
  const employees = (await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      department: true,
      startDate: true,
      lastRoleChangeDate: true,
      leaveBalances: { where: { type: "VACATION" }, select: { totalDays: true, usedDays: true } },
    },
  })) as EmployeeRow[];

  if (employees.length === 0) return [];

  const empIds = employees.map((e) => e.id);
  const userIds = employees.map((e) => e.userId);

  // Windows.
  const recentStart = shiftDays(asOf, RECENT_DAYS);
  const baselineStart = shiftDays(asOf, RECENT_DAYS * 2);
  const aiRecentStart = shiftDays(asOf, AI_RECENT_DAYS);
  const aiBaselineStart = shiftDays(asOf, AI_RECENT_DAYS * 2);

  // ── Non-protected leave (absence). Protected types are excluded at the query. ──
  const leaveRows = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: empIds },
      status: "APPROVED",
      type: { notIn: PROTECTED_LEAVE_TYPES },
      startDate: { gte: baselineStart, lte: asOf },
    },
    select: { employeeId: true, days: true, startDate: true, createdAt: true },
  });
  const recentAbsDays = new Map<string, number>();
  const baselineAbsDays = new Map<string, number>();
  const unplannedCount = new Map<string, number>();
  for (const r of leaveRows) {
    const unplanned = daysBetween(r.createdAt, r.startDate) < UNPLANNED_LEAD_DAYS;
    if (!unplanned) continue; // only erratic, short-notice absence counts
    if (r.startDate >= recentStart) {
      recentAbsDays.set(r.employeeId, (recentAbsDays.get(r.employeeId) ?? 0) + r.days);
      unplannedCount.set(r.employeeId, (unplannedCount.get(r.employeeId) ?? 0) + 1);
    } else {
      baselineAbsDays.set(r.employeeId, (baselineAbsDays.get(r.employeeId) ?? 0) + r.days);
    }
  }

  // ── Assistant usage (AiEvent TURN counts), recent vs personal baseline. ──
  const [recentAi, baselineAi] = await Promise.all([
    prisma.aiEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, kind: "TURN", createdAt: { gte: aiRecentStart, lte: asOf } },
      _count: { _all: true },
    }),
    prisma.aiEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, kind: "TURN", createdAt: { gte: aiBaselineStart, lt: aiRecentStart } },
      _count: { _all: true },
    }),
  ]);
  const recentTurns = new Map<string, number>();
  for (const g of recentAi) if (g.userId) recentTurns.set(g.userId, g._count._all);
  const baselineTurns = new Map<string, number>();
  for (const g of baselineAi) if (g.userId) baselineTurns.set(g.userId, g._count._all);

  // ── Latest 1:1 per employee. ──
  const oneOnOnes = await prisma.oneOnOne.findMany({
    where: { employeeId: { in: empIds } },
    select: { employeeId: true, heldAt: true },
    orderBy: { heldAt: "desc" },
  });
  const lastOneOnOne = new Map<string, Date>();
  for (const o of oneOnOnes) if (!lastOneOnOne.has(o.employeeId)) lastOneOnOne.set(o.employeeId, o.heldAt);

  // ── Latest qualitative rating per employee (aggregate only — raw notes never read here). ──
  const quals = await prisma.qualitativeSignal.findMany({
    where: { employeeId: { in: empIds } },
    select: { employeeId: true, workQuality: true, participation: true, peerInteraction: true, period: true },
    orderBy: { period: "desc" },
  });
  const lastQual = new Map<string, { workQuality: number; participation: number; peerInteraction: number }>();
  for (const q of quals) {
    if (!lastQual.has(q.employeeId)) {
      lastQual.set(q.employeeId, {
        workQuality: q.workQuality,
        participation: q.participation,
        peerInteraction: q.peerInteraction,
      });
    }
  }

  // ── Department cohort averages (for the two-tier fallback). ──
  const cohortAbs = departmentAverage(employees, (e) => recentAbsDays.get(e.id) ?? 0);
  const cohortTurns = departmentAverage(employees, (e) => recentTurns.get(e.userId) ?? 0);

  // ── Assemble one input per employee. ──
  return employees.map((e) => {
    const tenureDays = daysBetween(e.startDate, asOf);
    const recentDays = recentAbsDays.get(e.id) ?? 0;

    // Personal baselines are only valid if the employee existed during that window.
    const employedInAbsBaseline = e.startDate <= recentStart;
    const personalAbs = employedInAbsBaseline ? (baselineAbsDays.get(e.id) ?? 0) : null;
    const absBaseline = resolveBaseline(personalAbs, cohortAbs.get(e.department) ?? null, tenureDays);

    const rTurns = recentTurns.get(e.userId) ?? 0;
    const employedInAiBaseline = e.startDate <= aiRecentStart;
    const personalTurns = employedInAiBaseline ? (baselineTurns.get(e.userId) ?? null) : null;
    const aiBaseline = resolveBaseline(personalTurns, cohortTurns.get(e.department) ?? null, tenureDays);

    const vac = e.leaveBalances[0];
    const unusedPtoRatio = vac && vac.totalDays > 0 ? clamp((vac.totalDays - vac.usedDays) / vac.totalDays, 0, 1) : null;

    const last11 = lastOneOnOne.get(e.id);
    const q = lastQual.get(e.id) ?? null;

    const input: EngagementInput = {
      tenureDays,
      // Exhaustion axis
      absenceSpike: absenceSpike(recentDays, absBaseline),
      unplannedLeaveCount: unplannedCount.get(e.id) ?? 0, // 0 = real reading (no erratic absence)
      taskLatencyRatio: null, // no task-tracking system modeled yet → excluded (not faked)
      afterHoursRatio: null, // needs per-event timestamps + org timezone → deferred
      unusedPtoRatio,
      // Disengagement axis
      assistantUsageDrop: assistantDrop(rTurns, aiBaseline),
      daysSinceLastOneOnOne: last11 ? Math.round(daysBetween(last11, asOf)) : null,
      monthsInRole: Math.round(monthsBetween(e.lastRoleChangeDate ?? e.startDate, asOf)),
      // Qualitative (manager input) — null until a rating exists
      workQuality: q?.workQuality ?? null,
      participation: q?.participation ?? null,
      peerInteraction: q?.peerInteraction ?? null,
    };

    return { employeeId: e.id, userId: e.userId, department: e.department, input };
  });
}

/** Average of `pick(e)` per department (used as the cohort baseline fallback). */
function departmentAverage(employees: EmployeeRow[], pick: (e: EmployeeRow) => number): Map<string, number> {
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  for (const e of employees) {
    sum.set(e.department, (sum.get(e.department) ?? 0) + pick(e));
    count.set(e.department, (count.get(e.department) ?? 0) + 1);
  }
  const avg = new Map<string, number>();
  for (const [dept, s] of sum) avg.set(dept, s / (count.get(dept) ?? 1));
  return avg;
}

// ── EMA + momentum ───────────────────────────────────────────────────────────

/** Exponential moving average — smooths daily noise. First reading seeds itself. */
function ema(raw: number, prev: number | null): number {
  if (prev === null) return raw;
  return Math.round(EMA_ALPHA * raw + (1 - EMA_ALPHA) * prev);
}

/** Least-squares slope of a score series, in POINTS PER WEEK (negative = declining). */
function momentumPerWeek(points: { t: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.y - meanY);
    den += (p.t - meanT) ** 2;
  }
  if (den === 0) return null;
  return Math.round((num / den) * 7 * 10) / 10; // per-day slope → per-week, 1 decimal
}

function bandForScore(score: number, t: EngagementThresholds): EngagementBand {
  if (score >= t.greenMin) return "GREEN";
  if (score >= t.yellowMin) return "YELLOW";
  if (score >= t.orangeMin) return "ORANGE";
  return "RED";
}

// ── Daily orchestrator ───────────────────────────────────────────────────────

export type DailyEngagementSummary = {
  evaluated: number;
  alertsCreated: number;
  red: number;
  orange: number;
  lowConfidence: number;
  weightVersion: number;
};

/**
 * The 24h batch: score every ACTIVE employee, EMA-smooth against yesterday, compute
 * the 4-week momentum, persist a snapshot, and raise an ENGAGEMENT_RISK alert for
 * ORANGE/RED bands — but ONLY when confidence is not LOW (new hires with thin data
 * never trip an alert), and at most one open alert per employee (de-duplicated).
 */
export async function runDailyEngagementScoring(asOf: Date = new Date()): Promise<DailyEngagementSummary> {
  const candidates = await buildEngagementCandidates(asOf);
  const { config, version } = await getActiveEngagementConfig();

  if (candidates.length === 0) {
    return { evaluated: 0, alertsCreated: 0, red: 0, orange: 0, lowConfidence: 0, weightVersion: version };
  }

  const empIds = candidates.map((c) => c.employeeId);

  // Prior snapshots (trailing 4 weeks) → EMA seed + momentum series, in one query.
  const since = shiftDays(asOf, MOMENTUM_WINDOW_DAYS);
  const priorSnaps = await prisma.engagementSnapshot.findMany({
    where: { employeeId: { in: empIds }, computedAt: { gte: since, lt: asOf } },
    select: { employeeId: true, score: true, computedAt: true },
    orderBy: { computedAt: "asc" },
  });
  const history = new Map<string, { score: number; computedAt: Date }[]>();
  for (const s of priorSnaps) {
    const arr = history.get(s.employeeId) ?? [];
    arr.push({ score: s.score, computedAt: s.computedAt });
    history.set(s.employeeId, arr);
  }

  const dayOf = (d: Date) => d.getTime() / DAY_MS;

  type Scored = {
    employeeId: string;
    userId: string;
    row: Prisma.EngagementSnapshotCreateManyInput;
    band: EngagementBand;
    quadrant: string;
    score: number;
    lowConfidence: boolean;
  };

  const scored: Scored[] = candidates.map((c) => {
    const result = computeEngagement(c.input, config);

    // EMA against the most recent prior snapshot.
    const hist = history.get(c.employeeId) ?? [];
    const prev = hist.length ? hist[hist.length - 1].score : null;
    const smoothed = ema(result.score, prev);
    const band = bandForScore(smoothed, config.thresholds);

    // Momentum over the smoothed series (prior points + today's smoothed reading).
    const points = [
      ...hist.map((h) => ({ t: dayOf(h.computedAt), y: h.score })),
      { t: dayOf(asOf), y: smoothed },
    ];
    const momentum = momentumPerWeek(points);

    return {
      employeeId: c.employeeId,
      userId: c.userId,
      band,
      quadrant: result.quadrant,
      score: smoothed,
      lowConfidence: result.confidence === "LOW",
      row: {
        employeeId: c.employeeId,
        score: smoothed,
        band,
        exhaustion: result.exhaustion,
        disengagement: result.disengagement,
        quadrant: result.quadrant,
        factors: result.factors as unknown as Prisma.InputJsonValue,
        momentum,
        confidence: result.confidence,
        dataCoverage: result.dataCoverage,
        weightVersion: version,
        computedAt: asOf,
      },
    };
  });

  await prisma.engagementSnapshot.createMany({ data: scored.map((s) => s.row) });

  // ── Alerts: ORANGE/RED, confidence-gated, de-duplicated per subject. ──
  const flagged = scored.filter((s) => !s.lowConfidence && (s.band === "ORANGE" || s.band === "RED"));

  const existing =
    flagged.length === 0
      ? []
      : await prisma.alert.findMany({
          where: {
            kind: "ENGAGEMENT_RISK",
            status: { not: "RESOLVED" },
            subjectId: { in: flagged.map((s) => s.userId) },
          },
          select: { subjectId: true },
        });
  const alreadyAlerted = new Set(existing.map((a) => a.subjectId));

  let alertsCreated = 0;
  for (const s of flagged) {
    if (alreadyAlerted.has(s.userId)) continue;
    await createAlert({
      kind: "ENGAGEMENT_RISK",
      titleKey: "alerts.kind.ENGAGEMENT_RISK.title",
      severity: s.band === "RED" ? "CRITICAL" : "WARNING",
      params: { score: s.score, band: s.band, quadrant: s.quadrant }, // no PII
      href: "/team/engagement",
      subjectId: s.userId,
    });
    alertsCreated++;
  }

  return {
    evaluated: scored.length,
    alertsCreated,
    red: scored.filter((s) => s.band === "RED").length,
    orange: scored.filter((s) => s.band === "ORANGE").length,
    lowConfidence: scored.filter((s) => s.lowConfidence).length,
    weightVersion: version,
  };
}

// ── Read model for the AI tool / dashboards (scope-enforced, self-excluding) ──

/** One employee's latest engagement reading, for a caller authorized to see it. */
export type EngagementBoardRow = {
  employeeId: string;
  userId: string; // the subject's User (so the UI can resolve a name with RBAC) — never sent to the LLM
  department: string;
  score: number;
  band: EngagementBand;
  quadrant: EngagementQuadrant;
  exhaustion: number;
  disengagement: number;
  confidence: Confidence;
  /** Keys of the factors that most dragged the score down (no raw values). */
  topFactorKeys: string[];
};

/**
 * The latest engagement snapshot per employee the caller may see, sorted most
 * at-risk first. Enforces two hard privacy boundaries at the QUERY level:
 *   1. SCOPE — `engagement:read:all` (HR/Admin) → the whole active company;
 *      `engagement:read:team` (manager) → only their direct reports; else nothing.
 *   2. SELF-EXCLUSION — the caller's OWN row is removed unconditionally, so no one
 *      (not even HR) can read their own engagement score through this path.
 */
export async function getEngagementBoard(caller: {
  role: Role;
  employeeId: string | null;
}): Promise<EngagementBoardRow[]> {
  let scope: Prisma.EmployeeWhereInput;
  if (can(caller.role, "engagement:read:all")) {
    scope = { status: "ACTIVE" };
  } else if (can(caller.role, "engagement:read:team") && caller.employeeId) {
    scope = { status: "ACTIVE", managerId: caller.employeeId };
  } else {
    return [];
  }

  const snaps = await prisma.engagementSnapshot.findMany({
    where: {
      employee: scope,
      // Unconditional self-exclusion — belt-and-braces beyond the tool's self-query check.
      ...(caller.employeeId ? { employeeId: { not: caller.employeeId } } : {}),
    },
    distinct: ["employeeId"],
    orderBy: [{ employeeId: "asc" }, { computedAt: "desc" }],
    select: {
      employeeId: true,
      score: true,
      band: true,
      quadrant: true,
      exhaustion: true,
      disengagement: true,
      confidence: true,
      factors: true,
      employee: { select: { userId: true, department: true } },
    },
  });

  const rows: EngagementBoardRow[] = snaps.map((s) => {
    const factors = (s.factors as unknown as EngagementFactor[]) ?? [];
    const topFactorKeys = factors
      .filter((f) => f.key !== "baseline" && f.points < 0)
      .sort((a, b) => a.points - b.points)
      .slice(0, 3)
      .map((f) => f.key);
    return {
      employeeId: s.employeeId,
      userId: s.employee.userId,
      department: s.employee.department,
      score: s.score,
      band: s.band,
      quadrant: s.quadrant,
      exhaustion: s.exhaustion,
      disengagement: s.disengagement,
      confidence: s.confidence,
      topFactorKeys,
    };
  });

  // Most at-risk first (lowest score).
  return rows.sort((a, b) => a.score - b.score);
}

/**
 * Full dashboard read (WITH names) for the RBAC-gated manager/HR pages. Same scope
 * + self-exclusion guarantees as getEngagementBoard, but returns identity + the XAI
 * factor breakdown + a 4-week score history for the momentum sparkline. Names are
 * safe here because the PAGE is gated; the AI tool path never gets them.
 */
export type EngagementDashboardRow = {
  employeeId: string;
  userId: string;
  name: string;
  title: string;
  department: string;
  managerName: string | null;
  score: number;
  band: EngagementBand;
  quadrant: EngagementQuadrant;
  exhaustion: number;
  disengagement: number;
  momentum: number | null;
  confidence: Confidence;
  dataCoverage: number;
  factors: EngagementFactor[];
  history: number[]; // trailing ~4 weeks of scores, chronological (for the sparkline)
};

export async function getEngagementDashboard(caller: {
  role: Role;
  employeeId: string | null;
}): Promise<EngagementDashboardRow[]> {
  let scope: Prisma.EmployeeWhereInput;
  if (can(caller.role, "engagement:read:all")) {
    scope = { status: "ACTIVE" };
  } else if (can(caller.role, "engagement:read:team") && caller.employeeId) {
    scope = { status: "ACTIVE", managerId: caller.employeeId };
  } else {
    return [];
  }

  const snaps = await prisma.engagementSnapshot.findMany({
    where: {
      employee: scope,
      ...(caller.employeeId ? { employeeId: { not: caller.employeeId } } : {}),
    },
    distinct: ["employeeId"],
    orderBy: [{ employeeId: "asc" }, { computedAt: "desc" }],
    select: {
      employeeId: true,
      score: true,
      band: true,
      quadrant: true,
      exhaustion: true,
      disengagement: true,
      momentum: true,
      confidence: true,
      dataCoverage: true,
      factors: true,
      employee: {
        select: {
          userId: true,
          title: true,
          department: true,
          user: { select: { name: true } },
          manager: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  if (snaps.length === 0) return [];

  // Score history (last 4 weeks) for the sparkline — one batched query.
  const empIds = snaps.map((s) => s.employeeId);
  const since = shiftDays(new Date(), MOMENTUM_WINDOW_DAYS);
  const histRows = await prisma.engagementSnapshot.findMany({
    where: { employeeId: { in: empIds }, computedAt: { gte: since } },
    select: { employeeId: true, score: true, computedAt: true },
    orderBy: { computedAt: "asc" },
  });
  const history = new Map<string, number[]>();
  for (const h of histRows) {
    const arr = history.get(h.employeeId) ?? [];
    arr.push(h.score);
    history.set(h.employeeId, arr);
  }

  const rows: EngagementDashboardRow[] = snaps.map((s) => ({
    employeeId: s.employeeId,
    userId: s.employee.userId,
    name: s.employee.user.name,
    title: s.employee.title,
    department: s.employee.department,
    managerName: s.employee.manager?.user.name ?? null,
    score: s.score,
    band: s.band,
    quadrant: s.quadrant,
    exhaustion: s.exhaustion,
    disengagement: s.disengagement,
    momentum: s.momentum,
    confidence: s.confidence,
    dataCoverage: s.dataCoverage,
    factors: (s.factors as unknown as EngagementFactor[]) ?? [],
    history: history.get(s.employeeId) ?? [s.score],
  }));

  return rows.sort((a, b) => a.score - b.score);
}
