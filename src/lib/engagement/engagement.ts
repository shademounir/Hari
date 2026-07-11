// ─────────────────────────────────────────────────────────────────────────
// SCRUM-099 — Engagement & burnout/boreout scoring (pure core).
//
// A transparent, explainable model — NOT a black box. Two things make it
// jury-grade:
//   1. 2-D DIAGNOSIS. Signals map onto two orthogonal axes — EXHAUSTION (overload)
//      and DISENGAGEMENT (under-stimulation) — so we can tell burnout and boreout
//      apart. They present identically as a single low number but need OPPOSITE
//      interventions (reduce load vs. add challenge).
//   2. ADDITIVE XAI. The 0–100 score is `baseline + Σ signed contributions`, so
//      the UI can render an exact waterfall ("82 baseline → +10 great reviews →
//      −25 sick-leave spike → … = 47"). Every factor carries its signed points.
//
// Score semantics: 100 = fully engaged/healthy, 0 = severe risk (this INVERTS the
// departure-risk model, where high = bad). Bands follow the ticket:
//   GREEN 80–100 · YELLOW 60–79 · ORANGE 40–59 · RED 0–39.
//
// Design contract (the invariants that make it testable):
//   • PURE + DEPENDENCY-FREE. No Prisma, no I/O, no Date/now(). The data layer
//     derives every signal to a plain number (or null = "no data") and passes it
//     in, so the same input always yields the same output.
//   • MISSING ≠ BAD. A null signal contributes 0 points and is excluded from its
//     axis — a new hire with no history is NOT penalized; instead `confidence`
//     drops to LOW so the cron can suppress alerts (see the confidence gate).
//   • COEFFICIENTS ADJUSTABLE. HR recalibration passes `weights`/`baseline`/
//     `thresholds` (persisted as EngagementSignalConfig).
// ─────────────────────────────────────────────────────────────────────────

/** Bands (mirror the Prisma `EngagementBand` enum). */
export type EngagementBand = "GREEN" | "YELLOW" | "ORANGE" | "RED";

/** 2-D quadrant (mirror the Prisma `EngagementQuadrant` enum). */
export type EngagementQuadrant = "ENGAGED" | "BURNOUT" | "BOREOUT" | "STRAINED";

/** Trust in the score given data availability (mirror the Prisma `Confidence` enum). */
export type Confidence = "LOW" | "MEDIUM" | "HIGH";

/** The eleven signals (excludes the synthetic `baseline` contribution). */
export type EngagementSignalKey =
  // Exhaustion axis (overload / no recovery)
  | "absenceSpike"
  | "unplannedLeave"
  | "taskLatency"
  | "afterHours"
  | "unusedPto"
  // Disengagement axis (under-stimulation / withdrawal)
  | "assistantDrop"
  | "oneOnOneGap"
  | "roleStagnation"
  | "workQuality"
  | "participation"
  | "peerInteraction";

/** Every factor shown in the XAI breakdown, including the synthetic baseline. */
export type EngagementFactorKey = "baseline" | EngagementSignalKey;

export type EngagementAxis = "exhaustion" | "disengagement";

/** Max point-magnitude each signal can move the 0–100 score (HR-tunable). */
export type EngagementWeights = Record<EngagementSignalKey, number>;

/** Minimum score for each band-or-better. */
export type EngagementThresholds = { greenMin: number; yellowMin: number; orangeMin: number };

export type EngagementConfig = {
  /** Healthy starting point before any signal is applied (a neutral employee lands here). */
  baseline: number;
  weights: EngagementWeights;
  thresholds: EngagementThresholds;
};

/**
 * Fully-derived, privacy-safe signals for ONE employee. Every signal is a plain
 * number the data layer computed, or `null` when there isn't enough history.
 * No names, no ids — the caller keeps the mapping.
 */
export type EngagementInput = {
  /** Days employed — drives the confidence gate (new hires can't be scored confidently). */
  tenureDays: number;

  // ── Quantitative signals (null = no data / insufficient baseline) ────────
  /** Absence ratio vs personal/cohort baseline. 0 = normal, 1 = double the usual. */
  absenceSpike: number | null;
  /** Count of UNPLANNED leave events in the window (excludes protected leave). */
  unplannedLeaveCount: number | null;
  /** Task completion latency vs baseline. 1 = on par, >1 = slower (overload). */
  taskLatencyRatio: number | null;
  /** Fraction of activity outside working hours (overwork). 0..1. */
  afterHoursRatio: number | null;
  /** Fraction of PTO left unused (never recovering). 0..1. */
  unusedPtoRatio: number | null;
  /** Fraction drop in AI-assistant usage vs baseline. 0..1. WEAK signal — down-weighted. */
  assistantUsageDrop: number | null;
  /** Days since the last 1:1. null = no 1:1 on record yet (treated as no-data, not "bad"). */
  daysSinceLastOneOnOne: number | null;
  /** Months in the current (unchanged) role — the boreout/under-stimulation signal. */
  monthsInRole: number | null;

  // ── Qualitative signals — manager input, 1–5 (higher = better) ───────────
  workQuality: number | null;
  participation: number | null;
  peerInteraction: number | null;
};

/** One explainable contribution to the score (signed points; Σ points === score). */
export type EngagementFactor = {
  key: EngagementFactorKey;
  /** Signed points this factor added to the 0–100 score (negative = pulled it down). */
  points: number;
  /** The raw signal value, for the "why" panel (null for the baseline). */
  rawValue: number | null;
  /** Which axis it feeds; the baseline is `overall`. */
  axis: EngagementAxis | "overall";
};

export type EngagementResult = {
  /** Integer 0–100 (100 = most engaged). */
  score: number;
  band: EngagementBand;
  /** 0–100 exhaustion (Y axis). */
  exhaustion: number;
  /** 0–100 disengagement (X axis). */
  disengagement: number;
  quadrant: EngagementQuadrant;
  /** LOW when data is too thin to act on (e.g. a new hire). */
  confidence: Confidence;
  /** % of signals that had data, 0–100. */
  dataCoverage: number;
  /** Additive breakdown, baseline first then most-damaging factors. */
  factors: EngagementFactor[];
};

// ── Axis membership + qualitative flag ──────────────────────────────────────

const AXIS: Record<EngagementSignalKey, EngagementAxis> = {
  absenceSpike: "exhaustion",
  unplannedLeave: "exhaustion",
  taskLatency: "exhaustion",
  afterHours: "exhaustion",
  unusedPto: "exhaustion",
  assistantDrop: "disengagement",
  oneOnOneGap: "disengagement",
  roleStagnation: "disengagement",
  workQuality: "disengagement",
  participation: "disengagement",
  peerInteraction: "disengagement",
};

/** Manager-rated 1–5 signals — they can ADD points (good ratings boost the score). */
const QUALITATIVE: ReadonlySet<EngagementSignalKey> = new Set([
  "workQuality",
  "participation",
  "peerInteraction",
]);

export const SIGNAL_KEYS = Object.keys(AXIS) as EngagementSignalKey[];

// ── Defaults (HR can override via EngagementSignalConfig) ────────────────────

export const DEFAULT_ENGAGEMENT_CONFIG: EngagementConfig = {
  // A neutral employee (all signals healthy/absent) sits comfortably in GREEN.
  baseline: 82,
  weights: {
    // exhaustion (max −50 combined)
    absenceSpike: 15,
    unplannedLeave: 10,
    taskLatency: 10,
    afterHours: 8,
    unusedPto: 7,
    // disengagement
    assistantDrop: 4, // deliberately small — a confounded, weak signal (see ethics note)
    oneOnOneGap: 12,
    roleStagnation: 8,
    // qualitative (± around a neutral 3/5)
    workQuality: 10,
    participation: 6,
    peerInteraction: 6,
  },
  thresholds: { greenMin: 80, yellowMin: 60, orangeMin: 40 },
};

/** Axis midpoint separating the four quadrants. */
export const QUADRANT_MIDPOINT = 50;
/** Below this tenure a score is provisional regardless of coverage. */
export const MIN_TENURE_DAYS = 42; // ~6 weeks
const COVERAGE_LOW = 40;
const COVERAGE_HIGH = 70;

// ── Pure numeric helpers ────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
const clamp01 = (n: number) => clamp(n, 0, 1);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Linear ramp from `zeroAt` (→0) to `oneAt` (→1), clamped to [0,1]. */
function ramp(value: number, zeroAt: number, oneAt: number): number {
  if (zeroAt === oneAt) return value >= oneAt ? 1 : 0;
  return clamp01((value - zeroAt) / (oneAt - zeroAt));
}

/** A 1–5 manager rating → 0..1 risk (5 = 0 risk, 1 = max, 3 = neutral 0.5). */
function qualRisk(rating: number): number {
  return clamp01((5 - rating) / 4);
}

/** Raw signal → 0..1 "how bad". Each threshold pair is documented + tunable. */
const NORMALIZE: Record<EngagementSignalKey, (v: number) => number> = {
  absenceSpike: (v) => ramp(v, 0.2, 1.0), // >20% above baseline ramps; 2× = max
  unplannedLeave: (v) => ramp(v, 1, 5), // 1 event fine, 5+ maxes
  taskLatency: (v) => ramp(v, 1.1, 2.0), // 10% slower ramps; 2× = max
  afterHours: (v) => ramp(v, 0.15, 0.5), // >15% after-hours ramps
  unusedPto: (v) => ramp(v, 0.3, 0.8), // leaving >30% of PTO unused ramps
  assistantDrop: (v) => ramp(v, 0.4, 0.9), // weak: only a big, sustained drop registers
  oneOnOneGap: (v) => ramp(v, 45, 120), // >45 days ramps; 4 months = max
  roleStagnation: (v) => ramp(v, 24, 60), // boreout after ~2y, max at 5y
  workQuality: qualRisk,
  participation: qualRisk,
  peerInteraction: qualRisk,
};

// ── Derivations ─────────────────────────────────────────────────────────────

function bandFor(score: number, t: EngagementThresholds): EngagementBand {
  if (score >= t.greenMin) return "GREEN";
  if (score >= t.yellowMin) return "YELLOW";
  if (score >= t.orangeMin) return "ORANGE";
  return "RED";
}

function quadrantFor(exhaustion: number, disengagement: number): EngagementQuadrant {
  const hiEx = exhaustion >= QUADRANT_MIDPOINT;
  const hiDis = disengagement >= QUADRANT_MIDPOINT;
  if (hiEx && hiDis) return "BURNOUT";
  if (!hiEx && hiDis) return "BOREOUT";
  if (hiEx && !hiDis) return "STRAINED";
  return "ENGAGED";
}

function confidenceFor(tenureDays: number, dataCoverage: number): Confidence {
  if (tenureDays < MIN_TENURE_DAYS || dataCoverage < COVERAGE_LOW) return "LOW";
  if (dataCoverage < COVERAGE_HIGH) return "MEDIUM";
  return "HIGH";
}

/** Weighted mean of the present signals on one axis, scaled to 0–100. */
function axisValue(
  axis: EngagementAxis,
  risk: Record<EngagementSignalKey, number | null>,
  weights: EngagementWeights,
): number {
  let acc = 0;
  let wsum = 0;
  for (const key of SIGNAL_KEYS) {
    if (AXIS[key] !== axis) continue;
    const r = risk[key];
    if (r === null) continue;
    acc += r * weights[key];
    wsum += weights[key];
  }
  return wsum === 0 ? 0 : Math.round((acc / wsum) * 100);
}

/**
 * Compute an employee's engagement score (0–100), 2-D diagnosis, confidence, and
 * a full additive breakdown.
 *
 * @param input   Derived, privacy-safe signals (see EngagementInput).
 * @param config  Optional recalibration (weights / baseline / thresholds).
 */
export function computeEngagement(
  input: EngagementInput,
  config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
): EngagementResult {
  const { baseline, weights, thresholds } = config;

  // Raw value per signal (keyed the same as the factors).
  const raw: Record<EngagementSignalKey, number | null> = {
    absenceSpike: input.absenceSpike,
    unplannedLeave: input.unplannedLeaveCount,
    taskLatency: input.taskLatencyRatio,
    afterHours: input.afterHoursRatio,
    unusedPto: input.unusedPtoRatio,
    assistantDrop: input.assistantUsageDrop,
    oneOnOneGap: input.daysSinceLastOneOnOne,
    roleStagnation: input.monthsInRole,
    workQuality: input.workQuality,
    participation: input.participation,
    peerInteraction: input.peerInteraction,
  };

  // Normalized 0..1 risk per present signal (null stays null = no data).
  const risk = {} as Record<EngagementSignalKey, number | null>;
  for (const key of SIGNAL_KEYS) {
    const v = raw[key];
    risk[key] = v === null ? null : NORMALIZE[key](v);
  }

  // Additive contributions. Baseline first; missing signals contribute nothing.
  const factors: EngagementFactor[] = [
    { key: "baseline", points: round1(baseline), rawValue: null, axis: "overall" },
  ];
  for (const key of SIGNAL_KEYS) {
    const r = risk[key];
    if (r === null) continue; // no data → no contribution, and not shown in the "why"
    let points: number;
    if (QUALITATIVE.has(key)) {
      // Centered on a neutral 3/5: a 5/5 ADDS points, a 1/5 subtracts.
      points = ((raw[key]! - 3) / 2) * weights[key];
    } else {
      points = -r * weights[key];
    }
    factors.push({ key, points: round1(points), rawValue: raw[key], axis: AXIS[key] });
  }

  // Score = Σ (rounded) points, so the XAI waterfall reconciles exactly. Clamped 0–100.
  const rawScore = factors.reduce((s, f) => s + f.points, 0);
  const score = clamp(Math.round(rawScore), 0, 100);

  const exhaustion = axisValue("exhaustion", risk, weights);
  const disengagement = axisValue("disengagement", risk, weights);

  const present = SIGNAL_KEYS.filter((k) => risk[k] !== null).length;
  const dataCoverage = Math.round((present / SIGNAL_KEYS.length) * 100);

  // Baseline pinned first; then the most damaging factors (most negative) first.
  const [base, ...rest] = factors;
  rest.sort((a, b) => a.points - b.points);

  return {
    score,
    band: bandFor(score, thresholds),
    exhaustion,
    disengagement,
    quadrant: quadrantFor(exhaustion, disengagement),
    confidence: confidenceFor(input.tenureDays, dataCoverage),
    dataCoverage,
    factors: [base, ...rest],
  };
}
