// Anomaly engine (SCRUM-071 control-center). PURE — no DB, no clock. Compares a
// current value against its rolling baseline and classifies the deviation. Kept
// free of I/O so it can be exhaustively unit-tested with the mock factory.
import type { AnomalyResult, AnomalyStatus } from "@/types/dashboard";

export type AnomalyOptions = {
  /** Minimum baseline samples before we trust a verdict. Below this → insufficient_data. */
  minSamples?: number;
  /** |z| at/above this is "elevated". */
  elevatedZ?: number;
  /** |z| at/above this is "high". */
  highZ?: number;
};

const DEFAULTS: Required<AnomalyOptions> = {
  minSamples: 4,
  elevatedZ: 1.5,
  highZ: 2.5,
};

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1). 0 for fewer than two points. */
function sampleStdDev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((a, x) => a + (x - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Classify `current` against its `history` (the rolling baseline, most-recent
 * order irrelevant). When stdDev is 0 but the value differs from a non-zero mean
 * we fall back to a percentage-change rule, so a flat-then-spike series still
 * flags. Direction-agnostic by default: both surges and collapses are anomalies.
 */
export function detectAnomaly(
  history: number[],
  current: number,
  options: AnomalyOptions = {},
): AnomalyResult {
  const opts = { ...DEFAULTS, ...options };

  if (history.length < opts.minSamples) {
    return {
      status: "insufficient_data",
      current,
      mean: mean(history),
      stdDev: 0,
      zScore: 0,
      deltaPct: 0,
    };
  }

  const mu = mean(history);
  const sd = sampleStdDev(history, mu);
  const deltaPct = mu === 0 ? 0 : ((current - mu) / mu) * 100;
  const zScore = sd === 0 ? 0 : (current - mu) / sd;

  let status: AnomalyStatus;
  if (sd === 0) {
    // Flat baseline: lean on relative change (>=100% swing → high, >=50% → elevated).
    const absPct = Math.abs(deltaPct);
    status = absPct >= 100 ? "high" : absPct >= 50 ? "elevated" : "normal";
  } else {
    const absZ = Math.abs(zScore);
    status = absZ >= opts.highZ ? "high" : absZ >= opts.elevatedZ ? "elevated" : "normal";
  }

  return { status, current, mean: mu, stdDev: sd, zScore, deltaPct };
}
