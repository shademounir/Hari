// ─────────────────────────────────────────────────────────────────────────
// SCRUM-071 (control-center upgrade): the single RSC → client view-model
// contract for the Team dashboard. These types are PII-safe by construction —
// counts, ratios, and deviations only — so anything crossing to a client island
// (or into an AI prompt) can never carry a name or salary. Deliberately
// independent of Prisma types: the data layer maps rows into these; islands
// import only from here.
// ─────────────────────────────────────────────────────────────────────────

/** Bucketing granularity for a trend series. */
export type TrendGranularity = "week" | "month";

/** One point in a time series. `bucketStart` is an ISO date (UTC, day precision). */
export type TrendPoint = {
  bucketStart: string; // "YYYY-MM-DD"
  value: number;
};

export type TrendSeries = {
  metric: TrendMetric;
  granularity: TrendGranularity;
  points: TrendPoint[];
};

export type TrendMetric = "leaveVolume" | "aiTurns" | "aiRefusals";

// ── Anomaly engine ────────────────────────────────────────────────────────

/**
 * Where the current value sits versus its rolling baseline. `insufficient_data`
 * is a first-class state (not an error): early in a team's history, or for
 * metrics without reliable history (see headcount caveat), we say so rather than
 * render a false spike.
 */
export type AnomalyStatus = "normal" | "elevated" | "high" | "insufficient_data";

export type AnomalyResult = {
  status: AnomalyStatus;
  current: number;
  mean: number; // rolling mean of the baseline window
  stdDev: number; // sample standard deviation of the baseline
  zScore: number; // (current - mean) / stdDev, 0 when stdDev is 0
  deltaPct: number; // percent change vs mean, 0 when mean is 0
};

// ── KPI view model (card + trend + anomaly) ───────────────────────────────

export type KpiKey = "headcount" | "pendingRequests" | "aiTurns7d" | "aiRefusals7d";

export type KpiCardModel = {
  key: KpiKey;
  value: number;
  series: TrendPoint[]; // sparkline
  anomaly: AnomalyResult;
};

// ── Capacity heatmap ──────────────────────────────────────────────────────

/** Coverage-risk band for a single calendar day. */
export type RiskBand = "none" | "low" | "medium" | "high";

export type HeatmapCell = {
  date: string; // "YYYY-MM-DD"
  onLeave: number; // team members on approved leave that day
  ratio: number; // onLeave / teamSize, 0..1
  band: RiskBand;
};

export type HeatmapModel = {
  teamSize: number;
  rangeStart: string;
  rangeEnd: string;
  cells: HeatmapCell[];
  peakRatio: number; // worst single-day coverage ratio in the range
};

// ── What-if simulation ────────────────────────────────────────────────────

export type CapacityImpact = {
  peakOnLeave: number; // max concurrent absences over the candidate's span
  peakRatio: number; // that peak as a fraction of the team
  wouldBreach: boolean; // peak crosses the configured risk threshold
  worstDate: string | null; // the day of that peak
};

// ── AI insight (fed ONLY aggregates; see lib/ai/insights.ts) ──────────────

export type InsightTone = "positive" | "neutral" | "warning";

export type TeamInsight = {
  tone: InsightTone;
  headline: string;
  detail: string;
  suggestions: string[];
};

// ── Assembled dashboard model (the single server → page payload) ──────────

export type TeamDashboardModel = {
  kpis: KpiCardModel[];
  capacity: HeatmapModel;
  /** Inclusive window the capacity heatmap covers, echoed for the header. */
  capacityRange: { start: string; end: string };
};

// ── HR company-wide dashboard (SCRUM-072: AI activity + document corpus) ──

export type HrKpiKey = "aiQuestions7d" | "aiRefusals7d" | "aiErrors7d" | "openAlerts";

export type HrKpiCardModel = {
  key: HrKpiKey;
  value: number;
  series: TrendPoint[]; // sparkline
  anomaly: AnomalyResult;
};

/** Document counts by lifecycle status, company-wide — from lib/kb.ts. */
export type DocStatusCounts = { DRAFT: number; PUBLISHED: number; ARCHIVED: number; all: number };

export type HrDashboardModel = {
  kpis: HrKpiCardModel[];
  /** Refusals as a share of (questions + refusals) over the KPI window, 0..100. */
  refusalRatePct: number;
  docStatusCounts: DocStatusCounts;
};
