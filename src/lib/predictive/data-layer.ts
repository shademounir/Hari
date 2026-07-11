// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — Departure-risk DATA LAYER (server-only, RSC-first).
//
// Turns raw HR rows into the privacy-safe `DepartureRiskInput` the pure scorer
// (`departure-risk.ts`) consumes. All aggregation happens here on the server;
// the pure function never touches Prisma.
//
// PRIVACY: the returned object carries only DERIVED signals — elapsed months,
// day counts, a salary *growth ratio* (never the absolute salary), a boolean,
// and a 0–10 survey score. No names, no ids, no compensation figures. So the
// snapshot/alert written downstream inherits the AiEvent/Alert no-PII contract.
//
// AUTHORIZATION: this is an internal computation used by the 24h cron (system,
// company-wide) and by the HR dashboard. Who may *view* a result is gated at the
// consumer boundary (`predictions:read`, Increment 3) — exactly as `lib/hr.ts`
// scopes its callers — so this layer takes no caller and reads company-wide.
//
// EFFICIENCY / no N+1:
//   • Batch scoring (`scoreCandidates`, used by the cron and the dashboard) runs in
//     a FIXED number of queries regardless of headcount: `getDepartmentTurnoverRates`
//     (2 grouped) + `buildInputsForCandidates` (1 relational read, 1 grouped
//     sick-leave sum, 1 engagement read). No per-employee round-trip.
//   • The standalone path (`buildDepartureRiskInput`, one employee for the AI tool)
//     does its own small fetches and computes turnover for the single department.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import type { LeaveType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/alerts";
import { can, type Role } from "@/lib/rbac";
import {
  computeDepartureRisk,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type DepartureRiskInput,
  type DepartureRiskResult,
  type RiskThresholds,
  type RiskWeights,
} from "./departure-risk";

/**
 * Per-job-profile market baseline risk (0..1), kept as config here rather than
 * hardcoded inside the pure scorer. Matched case-insensitively as a substring of
 * the title; first hit wins, else `DEFAULT_JOB_PROFILE_BASELINE`. Tunable by HR
 * later without a migration. Higher = hotter market / easier to poach.
 */
export const JOB_PROFILE_BASELINES: ReadonlyArray<readonly [string, number]> = [
  ["engineer", 0.6],
  ["developer", 0.6],
  ["data", 0.55],
  ["designer", 0.5],
  ["sales", 0.45],
  ["product", 0.45],
  ["support", 0.35],
  ["hr", 0.25],
  ["finance", 0.3],
];
export const DEFAULT_JOB_PROFILE_BASELINE = 0.3;

export function jobProfileBaseline(title: string): number {
  const t = title.toLowerCase();
  for (const [needle, risk] of JOB_PROFILE_BASELINES) {
    if (t.includes(needle)) return risk;
  }
  return DEFAULT_JOB_PROFILE_BASELINE;
}

// ── Date helpers (local; the pure scorer owns its own copies) ───────────────

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);

/** Whole months between two dates (never negative). */
function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
}

/** `asOf` shifted back by `months` (UTC-safe via setUTCMonth). */
function subMonths(asOf: Date, months: number): Date {
  const d = new Date(asOf);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** PTO types that count toward "did they actually rest?" — sick leave excluded. */
const PTO_TYPES: LeaveType[] = ["VACATION", "PERSONAL"];

// The single relational read. Selected columns only — notably NO name/email, and
// the manager join carries just `leftAt` (the domino signal), nothing personal.
const employeeSelect = {
  startDate: true,
  department: true,
  title: true,
  salary: true,
  lastReviewDate: true,
  lastRoleChangeDate: true,
  manager: { select: { leftAt: true } },
  leaveBalances: { select: { type: true, totalDays: true, usedDays: true } },
  salaryChanges: {
    select: { effectiveDate: true, amount: true },
    orderBy: { effectiveDate: "desc" },
  },
} satisfies Prisma.EmployeeSelect;

type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

/**
 * Annualized turnover rate for a SINGLE department, as a 0..1 fraction:
 *   departures in the last 12 months / (current active headcount + those departures).
 * Bounded and division-safe. Two indexed COUNTs — used by the standalone path.
 */
export async function getDepartmentTurnover(department: string, asOf: Date): Promise<number> {
  const windowStart = subMonths(asOf, 12);
  const [active, departed] = await Promise.all([
    prisma.employee.count({ where: { department, status: "ACTIVE" } }),
    prisma.employee.count({
      where: { department, leftAt: { gte: windowStart, lte: asOf } },
    }),
  ]);
  const denom = active + departed;
  return denom === 0 ? 0 : departed / denom;
}

/**
 * Turnover rate for EVERY department in one shot — the N+1-free primitive for the
 * 24h cron. Two grouped queries total, regardless of headcount. Feed each result
 * into `buildDepartureRiskInput` via `opts.departmentTurnover`.
 */
export async function getDepartmentTurnoverRates(asOf: Date): Promise<Map<string, number>> {
  const windowStart = subMonths(asOf, 12);
  const [activeByDept, departedByDept] = await Promise.all([
    prisma.employee.groupBy({
      by: ["department"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.employee.groupBy({
      by: ["department"],
      where: { leftAt: { gte: windowStart, lte: asOf } },
      _count: { _all: true },
    }),
  ]);

  const active = new Map(activeByDept.map((r) => [r.department, r._count._all]));
  const departed = new Map(departedByDept.map((r) => [r.department, r._count._all]));
  const rates = new Map<string, number>();
  for (const dept of new Set([...active.keys(), ...departed.keys()])) {
    const a = active.get(dept) ?? 0;
    const d = departed.get(dept) ?? 0;
    rates.set(dept, a + d === 0 ? 0 : d / (a + d));
  }
  return rates;
}

/** Total approved SICK-leave days in the trailing 12 months (one aggregate). */
async function getSickDaysLast12m(employeeId: string, asOf: Date): Promise<number> {
  const windowStart = subMonths(asOf, 12);
  const agg = await prisma.leaveRequest.aggregate({
    _sum: { days: true },
    where: {
      employeeId,
      type: "SICK",
      status: "APPROVED",
      startDate: { gte: windowStart, lte: asOf },
    },
  });
  return agg._sum.days ?? 0;
}

/** Unused PTO days from current balances (vacation + personal; sick excluded), clamped ≥ 0. */
function unusedPtoDays(balances: EmployeeRow["leaveBalances"]): number {
  return balances
    .filter((b) => PTO_TYPES.includes(b.type))
    .reduce((sum, b) => sum + Math.max(0, b.totalDays - b.usedDays), 0);
}

/**
 * Salary growth over the last 12 months as a fraction. Reads the salary in effect
 * 12 months before `asOf` (latest SalaryChange on/before that date) and compares
 * it to today's salary. Unknown history (no prior change) → 0 (neutral, not risk).
 * The absolute figures never leave this function — only the ratio does.
 */
function salaryGrowthPct12m(current: number, changes: EmployeeRow["salaryChanges"], asOf: Date): number {
  const cutoff = subMonths(asOf, 12);
  // `changes` is ordered effectiveDate DESC → first one on/before the cutoff is
  // the salary that was in effect a year ago.
  const priorChange = changes.find((c) => c.effectiveDate <= cutoff);
  const prior = priorChange?.amount ?? 0;
  if (prior <= 0) return 0;
  return (current - prior) / prior;
}

/** Latest engagement survey score (0–10) on/before `asOf`, or null if none. */
async function getRecentEngagementScore(employeeId: string, asOf: Date): Promise<number | null> {
  const latest = await prisma.engagementSurvey.findFirst({
    where: { employeeId, surveyDate: { lte: asOf } },
    orderBy: { surveyDate: "desc" },
    select: { score: true },
  });
  return latest?.score ?? null;
}

export type BuildInputOpts = {
  /** Reference "now". Defaults to the current time. Pass a fixed date for reproducible cron runs. */
  asOf?: Date;
  /**
   * Precomputed department turnover (0..1). Supply this from
   * `getDepartmentTurnoverRates()` in batch/cron paths to avoid recomputing it
   * per employee. Omit for the standalone path (computed for the one department).
   */
  departmentTurnover?: number;
};

/**
 * Pure mapping from one employee's relational row + its three per-person signals
 * to the privacy-safe `DepartureRiskInput`. Kept pure (no Prisma) so the single
 * and batch fetch paths share ONE assembly implementation and can't drift.
 */
function assembleRiskInput(
  employee: EmployeeRow,
  signals: { asOf: Date; sickDays: number; engagementScore: number | null; departmentTurnover: number },
): DepartureRiskInput {
  const { asOf, sickDays, engagementScore, departmentTurnover } = signals;
  // "In current role" falls back to hire date when no role change is recorded.
  const roleAnchor = employee.lastRoleChangeDate ?? employee.startDate;
  // Domino effect: manager's departure within the last 6 months.
  const managerLeftAt = employee.manager?.leftAt ?? null;
  const managerLeftRecently =
    managerLeftAt !== null && managerLeftAt >= subMonths(asOf, 6) && managerLeftAt <= asOf;

  return {
    asOf,
    startDate: employee.startDate,
    lastReviewDate: employee.lastReviewDate,
    absenceDaysLast12m: sickDays,
    salaryGrowthPct12m: salaryGrowthPct12m(employee.salary, employee.salaryChanges, asOf),
    departmentTurnoverRate: departmentTurnover,
    jobProfileRiskBaseline: jobProfileBaseline(employee.title),
    unusedPtoDaysLast12m: unusedPtoDays(employee.leaveBalances),
    monthsInCurrentRole: monthsBetween(roleAnchor, asOf),
    managerLeftRecently,
    recentEngagementScore: engagementScore,
  };
}

/**
 * Assemble the full `DepartureRiskInput` for one employee — the privacy-safe,
 * fully-derived object the pure scorer consumes. Throws if the employee is
 * unknown (caller decides how to surface that). This is the STANDALONE path (the
 * AI tool, a single lookup); batch scoring uses `buildInputsForCandidates`.
 */
export async function buildDepartureRiskInput(
  employeeId: string,
  opts: BuildInputOpts = {},
): Promise<DepartureRiskInput> {
  const asOf = opts.asOf ?? new Date();

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: employeeSelect,
  });
  if (!employee) throw new Error(`Employee ${employeeId} not found`);

  // Independent aggregates run in parallel. Turnover is only computed here when
  // the caller didn't precompute it (cron passes it in → this branch is skipped).
  const [sickDays, engagementScore, departmentTurnover] = await Promise.all([
    getSickDaysLast12m(employeeId, asOf),
    getRecentEngagementScore(employeeId, asOf),
    opts.departmentTurnover ?? getDepartmentTurnover(employee.department, asOf),
  ]);

  return assembleRiskInput(employee, { asOf, sickDays, engagementScore, departmentTurnover });
}

/**
 * Batch equivalent of `buildDepartureRiskInput` for a set of employees, in a FIXED
 * number of queries regardless of headcount: one relational read, one grouped
 * sick-leave sum, and one engagement read (latest-per-employee picked in memory).
 * Turnover is supplied precomputed by the caller. Returns a map keyed by employeeId;
 * an id with no matching employee is simply absent.
 */
async function buildInputsForCandidates(
  candidateIds: string[],
  opts: { asOf: Date; turnover: Map<string, number> },
): Promise<Map<string, DepartureRiskInput>> {
  const inputs = new Map<string, DepartureRiskInput>();
  if (candidateIds.length === 0) return inputs;
  const { asOf, turnover } = opts;
  const windowStart = subMonths(asOf, 12);

  const [employees, sickByEmployee, surveys] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: candidateIds } },
      select: { ...employeeSelect, id: true },
    }),
    prisma.leaveRequest.groupBy({
      by: ["employeeId"],
      where: {
        employeeId: { in: candidateIds },
        type: "SICK",
        status: "APPROVED",
        startDate: { gte: windowStart, lte: asOf },
      },
      _sum: { days: true },
    }),
    prisma.engagementSurvey.findMany({
      where: { employeeId: { in: candidateIds }, surveyDate: { lte: asOf } },
      orderBy: { surveyDate: "desc" },
      select: { employeeId: true, score: true },
    }),
  ]);

  const sickDaysByEmployee = new Map(sickByEmployee.map((r) => [r.employeeId, r._sum.days ?? 0]));
  // `surveys` is ordered surveyDate DESC → the first row seen per employee is the latest.
  const engagementByEmployee = new Map<string, number>();
  for (const s of surveys) {
    if (!engagementByEmployee.has(s.employeeId)) engagementByEmployee.set(s.employeeId, s.score);
  }

  for (const employee of employees) {
    inputs.set(
      employee.id,
      assembleRiskInput(employee, {
        asOf,
        sickDays: sickDaysByEmployee.get(employee.id) ?? 0,
        engagementScore: engagementByEmployee.get(employee.id) ?? null,
        departmentTurnover: turnover.get(employee.department) ?? 0,
      }),
    );
  }
  return inputs;
}

// ─────────────────────────────────────────────────────────────────────────
// Scoring orchestration — shared by the AI tool and the 24h cron.
// ─────────────────────────────────────────────────────────────────────────

/** The active coefficient set + which version produced it (for reproducibility). */
export type ActiveModelConfig = {
  weights: RiskWeights;
  thresholds: RiskThresholds;
  version: number; // 0 = built-in defaults (no DB config yet)
};

/**
 * The active, HR-recalibrated coefficients — or the built-in defaults (version 0)
 * when no config row exists yet. JSON columns are validated loosely and any
 * missing key falls back to its default, so a partial/legacy row can't NaN a score.
 */
export async function getActiveModelConfig(): Promise<ActiveModelConfig> {
  const row = await prisma.predictiveWeightConfig.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
    select: { version: true, weights: true, thresholds: true },
  });
  if (!row) return { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, version: 0 };

  const w = (row.weights ?? {}) as Partial<Record<keyof RiskWeights, number>>;
  const t = (row.thresholds ?? {}) as Partial<RiskThresholds>;
  const weights = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]) {
    if (typeof w[k] === "number") weights[k] = w[k] as number;
  }
  const thresholds: RiskThresholds = {
    medium: typeof t.medium === "number" ? t.medium : DEFAULT_THRESHOLDS.medium,
    high: typeof t.high === "number" ? t.high : DEFAULT_THRESHOLDS.high,
  };
  return { weights, thresholds, version: row.version };
}

/** An employee eligible for scoring, with the identity fields a caller may need. */
export type RiskCandidate = {
  employeeId: string;
  userId: string; // the User this Employee maps to (alert subject; never sent to the model)
  name: string;
  title: string;
  department: string;
};

export type ScoredCandidate = RiskCandidate & {
  score: number;
  band: DepartureRiskResult["band"];
  factors: DepartureRiskResult["factors"];
};

const candidateSelect = {
  id: true,
  title: true,
  department: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

function toCandidate(e: Prisma.EmployeeGetPayload<{ select: typeof candidateSelect }>): RiskCandidate {
  return { employeeId: e.id, userId: e.user.id, name: e.user.name, title: e.title, department: e.department };
}

/**
 * The ACTIVE employees a caller may have scored, respecting directory scope:
 *   • `directory:read:all` (HR/Admin/system) → the whole company.
 *   • `directory:read:team` (manager) → their direct reports only (not self).
 *   • otherwise → none.
 * This is the authorization boundary for WHICH employees enter the risk board;
 * anonymization of the RESULT is a separate concern applied by the tool.
 */
export async function getPredictionCandidates(caller: {
  role: Role;
  employeeId: string | null;
}): Promise<RiskCandidate[]> {
  let where: Prisma.EmployeeWhereInput;
  if (can(caller.role, "directory:read:all")) {
    where = { status: "ACTIVE" };
  } else if (can(caller.role, "directory:read:team") && caller.employeeId) {
    where = { status: "ACTIVE", managerId: caller.employeeId };
  } else {
    return [];
  }
  const rows = await prisma.employee.findMany({ where, select: candidateSelect });
  return rows.map(toCandidate);
}

/**
 * Score a set of candidates and return them sorted by descending risk. The entire
 * batch runs in a FIXED number of queries — turnover (2 grouped), plus the 3 reads
 * inside `buildInputsForCandidates` — regardless of headcount, so the nightly cron
 * and the first-load dashboard don't fan out `3×N` concurrent queries and exhaust
 * the connection pool. The pure scorer then runs in memory.
 */
export async function scoreCandidates(
  candidates: RiskCandidate[],
  opts: { asOf: Date; config: ActiveModelConfig },
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return [];
  const { asOf, config } = opts;
  const turnover = await getDepartmentTurnoverRates(asOf);
  const inputs = await buildInputsForCandidates(
    candidates.map((c) => c.employeeId),
    { asOf, turnover },
  );

  const scored = candidates.flatMap((c) => {
    const input = inputs.get(c.employeeId);
    if (!input) return []; // employee vanished between candidate fetch and scoring
    const result = computeDepartureRisk(input, {
      weights: config.weights,
      thresholds: config.thresholds,
    });
    return [{ ...c, score: result.score, band: result.band, factors: result.factors }];
  });

  return scored.sort((a, b) => b.score - a.score);
}

export type DailyScoringSummary = {
  evaluated: number;
  highRisk: number;
  alertsCreated: number;
  weightVersion: number;
};

/**
 * The 24h batch: score every ACTIVE employee, persist a snapshot per person
 * (history + accuracy backtesting), and raise a DEPARTURE_RISK alert for anyone
 * over the high threshold — at most ONE open alert per employee (deduped against
 * existing unresolved alerts, so a persistently-at-risk person isn't re-alerted
 * every night). Snapshots and alerts store only score/band/factor keys — no PII.
 * Called by the cron route (which owns authentication).
 */
export async function runDailyRiskScoring(asOf: Date = new Date()): Promise<DailyScoringSummary> {
  // System scope: SUPER_ADMIN holds directory:read:all → the whole active company.
  const candidates = await getPredictionCandidates({ role: "SUPER_ADMIN", employeeId: null });
  const config = await getActiveModelConfig();
  const scored = await scoreCandidates(candidates, { asOf, config });

  if (scored.length > 0) {
    await prisma.departureRiskSnapshot.createMany({
      data: scored.map((s) => ({
        employeeId: s.employeeId,
        score: s.score,
        band: s.band,
        factors: s.factors as unknown as Prisma.InputJsonValue,
        weightVersion: config.version,
        computedAt: asOf,
      })),
    });
  }

  const highRisk = scored.filter((s) => s.score > config.thresholds.high);

  // One query for all subjects that already have an unresolved departure alert.
  const existing =
    highRisk.length === 0
      ? []
      : await prisma.alert.findMany({
          where: {
            kind: "DEPARTURE_RISK",
            status: { not: "RESOLVED" },
            subjectId: { in: highRisk.map((s) => s.userId) },
          },
          select: { subjectId: true },
        });
  const alreadyAlerted = new Set(existing.map((a) => a.subjectId));

  let alertsCreated = 0;
  for (const s of highRisk) {
    if (alreadyAlerted.has(s.userId)) continue;
    await createAlert({
      kind: "DEPARTURE_RISK",
      titleKey: "alerts.kind.DEPARTURE_RISK.title",
      severity: s.score >= 85 ? "CRITICAL" : "WARNING",
      params: { score: s.score, band: s.band }, // no PII — score/band only
      href: "/analytics/predictions",
      subjectId: s.userId, // the at-risk employee's User (FK); resolved to a name only in the HR-gated console
    });
    alertsCreated++;
  }

  return { evaluated: scored.length, highRisk: highRisk.length, alertsCreated, weightVersion: config.version };
}
