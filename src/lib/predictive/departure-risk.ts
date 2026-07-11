// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — Departure-risk scoring ("Pragmatic ML-Lite").
//
// A transparent, weighted scoring system — NOT a black-box model. Every score
// is fully explained by a list of per-factor contributions (see `factors` in
// the result), so HR can always answer "why is this person flagged?".
//
// Ten factors, grouped:
//   Core signals   — seniority, absenteeism, review recency, salary evolution,
//                    department turnover, job-profile baseline.
//   Weak signals   — burnout (unused PTO), role stagnation (internal mobility),
//                    the domino effect (manager just left), and engagement
//                    (internal survey score). Individually subtle, together they
//                    catch disengagement the core signals miss.
//
// Design contract (keep these invariants — they're what makes it testable):
//   • PURE + DEPENDENCY-FREE. No Prisma, no I/O, no `Date.now()`. The caller
//     passes fully-derived employee data as a plain object plus an explicit
//     `asOf` reference date, so the same input always yields the same output.
//   • Data collection (aggregating sick leave, salary history, dept turnover,
//     unused PTO, manager status, survey scores) happens server-side in the data
//     layer; this file only does the math.
//   • Coefficients are adjustable: pass `weights` (HR recalibration). Scores are
//     normalized by the SUM of weights, so bumping one coefficient doesn't force
//     you to rescale the others.
// ─────────────────────────────────────────────────────────────────────────

/** The ten scoring factors. */
export type RiskFactorKey =
  // core
  | "seniority"
  | "absenteeism"
  | "review"
  | "salary"
  | "turnover"
  | "jobProfile"
  // weak signals (SCRUM-098 Increment 1.5)
  | "burnout"
  | "roleStagnation"
  | "dominoEffect"
  | "engagement";

/** Adjustable coefficient per factor (any non-negative numbers; we normalize by their sum). */
export type RiskWeights = Record<RiskFactorKey, number>;

/** Score cut-points for the green / orange / red bands. `score > high` triggers the alert. */
export type RiskThresholds = { medium: number; high: number };

/** Risk map bands: LOW = green, MEDIUM = orange, HIGH = red. */
export type RiskBand = "LOW" | "MEDIUM" | "HIGH";

/**
 * Fully-derived, privacy-safe inputs for ONE employee. No names, no ids — the
 * caller keeps the mapping. Dates + `asOf` are passed explicitly so all elapsed-
 * time factors are deterministic (no hidden clock).
 */
export type DepartureRiskInput = {
  /** Reference "now" — all elapsed-time factors are measured against this. */
  asOf: Date;
  /** Employment start date → seniority. */
  startDate: Date;
  /** Most recent performance review, or null if never reviewed. */
  lastReviewDate: Date | null;
  /** Unplanned/sick absence days in the trailing 12 months. */
  absenceDaysLast12m: number;
  /** Salary growth over the last 12 months as a fraction (0.05 = +5%; negative = pay cut). */
  salaryGrowthPct12m: number;
  /** Annualized turnover rate of the employee's department, 0..1 (0.2 = 20% left this year). */
  departmentTurnoverRate: number;
  /** Market/role baseline risk for this job profile, 0..1 (configurable per title, not hardcoded). */
  jobProfileRiskBaseline: number;

  // ── Weak signals ──────────────────────────────────────────────────────
  /**
   * Burnout / charge de travail: allotted PTO days left UNUSED over the last 12
   * months. Hoarding time off (taking almost none) is an overwork signal — the
   * more days left on the table, the higher the burnout risk.
   */
  unusedPtoDaysLast12m: number;
  /**
   * Internal mobility: months in the CURRENT role (distinct from overall
   * seniority). A long stretch without a role change signals stagnation.
   */
  monthsInCurrentRole: number;
  /**
   * Domino effect: did this employee's direct manager leave recently (e.g. in
   * the last 6 months)? A departing manager sharply raises reports' flight risk.
   */
  managerLeftRecently: boolean;
  /**
   * Engagement (feedbacks internes): most recent internal survey score, 0–10.
   * Below ~5 is a disengagement signal. `null` = no recent survey (treated as
   * neutral, not as risk — absence of a survey isn't evidence of disengagement).
   */
  recentEngagementScore: number | null;
};

/** One factor's explained contribution to the final score. */
export type FactorContribution = {
  key: RiskFactorKey;
  /** The 0..1 risk this factor evaluated to (0 = no risk, 1 = max risk). */
  normalized: number;
  /** The effective weight after normalization (weight / sum-of-weights). */
  weight: number;
  /** Points this factor added to the 0–100 score (Σ points === score). */
  points: number;
  /** The raw input this factor read, for the "why" panel (booleans as 0/1; null = no data). */
  rawValue: number | null;
};

export type DepartureRiskResult = {
  /** Integer 0–100. */
  score: number;
  band: RiskBand;
  /** Per-factor breakdown, sorted by descending contribution (biggest driver first). */
  factors: FactorContribution[];
};

/**
 * Default coefficients (sum = 1.0) across all ten factors. Starting point for the
 * model; HR can override via `PredictiveWeightConfig`. The weak signals carry
 * real weight — the domino effect and a low engagement score are among the
 * strongest short-term predictors — while no single factor can dominate the score.
 */
export const DEFAULT_WEIGHTS: RiskWeights = {
  // core (0.55)
  seniority: 0.08,
  absenteeism: 0.1,
  review: 0.1,
  salary: 0.12,
  turnover: 0.08,
  jobProfile: 0.07,
  // weak signals (0.45)
  burnout: 0.1,
  roleStagnation: 0.1,
  dominoEffect: 0.12,
  engagement: 0.13,
};

/** `score > high` raises a DEPARTURE_RISK alert; `>= medium` is orange; below is green. */
export const DEFAULT_THRESHOLDS: RiskThresholds = { medium: 40, high: 70 };

// ── Small, pure numeric helpers (documented so the model stays explicable) ──

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Whole months between two dates (never negative). */
function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
}

/**
 * Linear ramp from `zeroAt` (→ 0) to `oneAt` (→ 1), clamped to [0,1]. Works in
 * both directions: if `oneAt < zeroAt` the ramp is decreasing (higher input =
 * lower risk), which we use for the "salary growth" and "engagement" factors.
 */
function ramp(value: number, zeroAt: number, oneAt: number): number {
  if (zeroAt === oneAt) return value >= oneAt ? 1 : 0;
  return clamp01((value - zeroAt) / (oneAt - zeroAt));
}

// ── Per-factor normalizers: each maps a raw signal to 0..1 risk ─────────────

/**
 * Seniority follows the well-known U-shape: flight risk is high during the first
 * ~18 months (bad-fit / onboarding churn) AND again after a long, un-promoted
 * tenure (plateau). Everything in between is the low-risk "sweet spot".
 */
function seniorityRisk(tenureMonths: number): number {
  const newHire = ramp(tenureMonths, 18, 0); // 1 at day 0 → 0 by 18 months
  const plateau = ramp(tenureMonths, 60, 120); // 0 until 5y → 1 at 10y
  return Math.max(newHire, plateau);
}

/** Absence: no risk up to ~1 week/yr, saturating toward 25+ days. */
function absenteeismRisk(days: number): number {
  return ramp(days, 5, 25);
}

/** Review neglect: fine within 6 months, max risk past 18. Never reviewed = max. */
function reviewRisk(monthsSinceReview: number | null): number {
  if (monthsSinceReview === null) return 1;
  return ramp(monthsSinceReview, 6, 18);
}

/** Comp stagnation: a healthy raise (≥5%) is no risk; flat/negative growth ramps to max. */
function salaryRisk(growthPct: number): number {
  return ramp(growthPct, 0.05, -0.02);
}

/** Department instability (contagion): low under 5% annual turnover, max at 30%+. */
function turnoverRisk(rate: number): number {
  return ramp(rate, 0.05, 0.3);
}

/** Job profile is already a 0..1 market baseline; just clamp it. */
function jobProfileRisk(baseline: number): number {
  return clamp01(baseline);
}

/**
 * Burnout: risk rises with UNUSED PTO. Using most of your allotment is healthy
 * (≤3 days left → 0); leaving ~15+ days unused signals someone who never steps
 * away. Negative inputs (over-used balance) clamp to 0.
 */
function burnoutRisk(unusedPtoDays: number): number {
  return ramp(unusedPtoDays, 3, 15);
}

/**
 * Role stagnation: no risk in the first ~18 months in a role, ramping to max by
 * 48 months (crossing ~0.6 at the 3-year mark the spec calls out).
 */
function roleStagnationRisk(monthsInRole: number): number {
  return ramp(monthsInRole, 18, 48);
}

/** Domino effect: a recent manager departure is a hard, binary risk spike. */
function dominoRisk(managerLeftRecently: boolean): number {
  return managerLeftRecently ? 1 : 0;
}

/**
 * Engagement: a decreasing ramp on the 0–10 survey score — ≥7 is healthy (0),
 * ≤3 is max risk, crossing 0.5 right at the 5 the spec flags. `null` (no recent
 * survey) is neutral (0.5), not risk: a missing survey isn't evidence of anything.
 */
function engagementRisk(score: number | null): number {
  if (score === null) return 0.5;
  return ramp(score, 7, 3);
}

function bandFor(score: number, t: RiskThresholds): RiskBand {
  if (score > t.high) return "HIGH";
  if (score >= t.medium) return "MEDIUM";
  return "LOW";
}

/**
 * Compute an employee's departure-risk score (0–100) with a full, explicable
 * per-factor breakdown.
 *
 * @param input   Derived, privacy-safe employee signals (see DepartureRiskInput).
 * @param opts    Optional recalibration: custom weights and/or band thresholds.
 */
export function computeDepartureRisk(
  input: DepartureRiskInput,
  opts: { weights?: RiskWeights; thresholds?: RiskThresholds } = {},
): DepartureRiskResult {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  const tenureMonths = monthsBetween(input.startDate, input.asOf);
  const monthsSinceReview =
    input.lastReviewDate === null ? null : monthsBetween(input.lastReviewDate, input.asOf);

  // (normalized 0..1 risk, raw value shown in the explanation) per factor.
  const normalized: Record<RiskFactorKey, { risk: number; raw: number | null }> = {
    seniority: { risk: seniorityRisk(tenureMonths), raw: Math.round(tenureMonths) },
    absenteeism: { risk: absenteeismRisk(input.absenceDaysLast12m), raw: input.absenceDaysLast12m },
    review: { risk: reviewRisk(monthsSinceReview), raw: monthsSinceReview === null ? null : Math.round(monthsSinceReview) },
    salary: { risk: salaryRisk(input.salaryGrowthPct12m), raw: input.salaryGrowthPct12m },
    turnover: { risk: turnoverRisk(input.departmentTurnoverRate), raw: input.departmentTurnoverRate },
    jobProfile: { risk: jobProfileRisk(input.jobProfileRiskBaseline), raw: input.jobProfileRiskBaseline },
    burnout: { risk: burnoutRisk(input.unusedPtoDaysLast12m), raw: input.unusedPtoDaysLast12m },
    roleStagnation: { risk: roleStagnationRisk(input.monthsInCurrentRole), raw: Math.round(input.monthsInCurrentRole) },
    dominoEffect: { risk: dominoRisk(input.managerLeftRecently), raw: input.managerLeftRecently ? 1 : 0 },
    engagement: { risk: engagementRisk(input.recentEngagementScore), raw: input.recentEngagementScore },
  };

  const keys = Object.keys(weights) as RiskFactorKey[];
  // Normalize by the sum of weights so coefficients are freely adjustable.
  const totalWeight = keys.reduce((sum, k) => sum + Math.max(0, weights[k]), 0) || 1;

  let scoreExact = 0;
  const factors: FactorContribution[] = keys.map((key) => {
    const effectiveWeight = Math.max(0, weights[key]) / totalWeight;
    const points = effectiveWeight * normalized[key].risk * 100;
    scoreExact += points;
    return {
      key,
      normalized: round(normalized[key].risk, 3),
      weight: round(effectiveWeight, 3),
      points: round(points, 1),
      rawValue: normalized[key].raw,
    };
  });

  // Biggest driver first → drives the "why is this person at risk?" explanation.
  factors.sort((a, b) => b.points - a.points);

  const score = Math.round(scoreExact);
  return { score, band: bandFor(score, thresholds), factors };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
