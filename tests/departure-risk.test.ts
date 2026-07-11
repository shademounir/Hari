import { describe, it, expect } from "vitest";
import {
  computeDepartureRisk,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type DepartureRiskInput,
  type DepartureRiskResult,
  type RiskFactorKey,
} from "@/lib/predictive/departure-risk";

// A fixed reference date so every elapsed-time factor is deterministic.
const ASOF = new Date("2026-07-07T00:00:00Z");

/** A deliberately LOW-risk baseline; individual tests override single fields. */
function baseline(overrides: Partial<DepartureRiskInput> = {}): DepartureRiskInput {
  return {
    asOf: ASOF,
    startDate: new Date("2023-01-01"), // ~3.5y tenure → sweet spot
    lastReviewDate: new Date("2026-05-01"), // ~2 months ago
    absenceDaysLast12m: 2,
    salaryGrowthPct12m: 0.08, // healthy raise
    departmentTurnoverRate: 0.03,
    jobProfileRiskBaseline: 0.2,
    unusedPtoDaysLast12m: 1, // took their time off
    monthsInCurrentRole: 10,
    managerLeftRecently: false,
    recentEngagementScore: 8,
    ...overrides,
  };
}

const factor = (r: DepartureRiskResult, key: RiskFactorKey) =>
  r.factors.find((f) => f.key === key)!;

describe("computeDepartureRisk — configuration invariants", () => {
  it("ships ten factors whose default weights sum to 1.0", () => {
    const keys = Object.keys(DEFAULT_WEIGHTS);
    expect(keys).toHaveLength(10);
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("returns a full breakdown: one contribution per factor, points summing to the score", () => {
    const r = computeDepartureRisk(baseline({ salaryGrowthPct12m: 0, recentEngagementScore: 4 }));
    expect(r.factors).toHaveLength(10);
    const pointsSum = r.factors.reduce((s, f) => s + f.points, 0);
    // Σ points reconciles to the score (± rounding of the individual points).
    expect(Math.round(pointsSum)).toBe(r.score);
  });

  it("keeps the score within 0..100 even under all-max inputs", () => {
    const r = computeDepartureRisk(
      baseline({
        startDate: ASOF, // brand-new hire
        lastReviewDate: null,
        absenceDaysLast12m: 60,
        salaryGrowthPct12m: -0.2,
        departmentTurnoverRate: 1,
        jobProfileRiskBaseline: 1,
        unusedPtoDaysLast12m: 40,
        monthsInCurrentRole: 120,
        managerLeftRecently: true,
        recentEngagementScore: 0,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThan(DEFAULT_THRESHOLDS.high);
    expect(r.band).toBe("HIGH");
  });
});

describe("computeDepartureRisk — bands", () => {
  it("a healthy employee lands in the GREEN (LOW) band", () => {
    const r = computeDepartureRisk(baseline());
    expect(r.band).toBe("LOW");
    expect(r.score).toBeLessThan(DEFAULT_THRESHOLDS.medium);
  });

  it("the classic at-risk profile — burnt out, manager left, no raise, disengaged — hits RED (HIGH)", () => {
    // A genuinely at-risk employee trips several signals at once, led by the weak
    // signals the ticket calls out (burnout / domino / stagnation / engagement).
    const r = computeDepartureRisk(
      baseline({
        unusedPtoDaysLast12m: 16, // burnout: never took time off
        managerLeftRecently: true, // domino effect
        salaryGrowthPct12m: -0.02, // comp went backwards
        recentEngagementScore: 2, // disengaged
        lastReviewDate: null, // no review on record → neglected
        monthsInCurrentRole: 54, // role stagnation (4.5y)
        absenceDaysLast12m: 18, // rising absenteeism
        departmentTurnoverRate: 0.25, // churning department
        jobProfileRiskBaseline: 0.6, // hot-market role
      }),
    );
    expect(r.band).toBe("HIGH");
    expect(r.score).toBeGreaterThan(DEFAULT_THRESHOLDS.high); // > 70 → triggers DEPARTURE_RISK alert
  });
});

describe("computeDepartureRisk — explicability (top drivers surface correctly)", () => {
  it("sorts factors by descending contribution, so the biggest driver is first", () => {
    const r = computeDepartureRisk(
      baseline({ managerLeftRecently: true, recentEngagementScore: 2 }),
    );
    for (let i = 1; i < r.factors.length; i++) {
      expect(r.factors[i - 1].points).toBeGreaterThanOrEqual(r.factors[i].points);
    }
  });

  it("surfaces the weak signals as the top drivers of an otherwise-healthy profile", () => {
    const r = computeDepartureRisk(
      baseline({ managerLeftRecently: true, recentEngagementScore: 2 }),
    );
    const topTwo = r.factors.slice(0, 2).map((f) => f.key);
    expect(topTwo).toContain("dominoEffect");
    expect(topTwo).toContain("engagement");
    // ...and those weak signals are actually contributing risk, not just present.
    expect(factor(r, "dominoEffect").normalized).toBe(1);
    expect(factor(r, "engagement").normalized).toBeGreaterThan(0.5);
  });

  it("isolates a single driver: only the burnt-out factor carries risk when nothing else is wrong", () => {
    const r = computeDepartureRisk(baseline({ unusedPtoDaysLast12m: 15 }));
    expect(factor(r, "burnout").normalized).toBe(1);
    expect(r.factors[0].key).toBe("burnout"); // the sole driver ranks first
    // Every other factor contributes strictly fewer points than the lone driver.
    const burnoutPoints = factor(r, "burnout").points;
    for (const f of r.factors) {
      if (f.key !== "burnout") expect(f.points).toBeLessThan(burnoutPoints);
    }
  });
});

describe("computeDepartureRisk — factor normalizers are sound", () => {
  it("engagement is a decreasing ramp crossing 0.5 at a score of 5; null is neutral, not risk", () => {
    const at5 = factor(computeDepartureRisk(baseline({ recentEngagementScore: 5 })), "engagement");
    const at9 = factor(computeDepartureRisk(baseline({ recentEngagementScore: 9 })), "engagement");
    const atNull = factor(computeDepartureRisk(baseline({ recentEngagementScore: null })), "engagement");
    expect(at5.normalized).toBeCloseTo(0.5, 5);
    expect(at9.normalized).toBe(0); // healthy → no risk
    expect(atNull.normalized).toBe(0.5); // no survey → neutral
    expect(atNull.rawValue).toBeNull();
  });

  it("burnout rises with unused PTO; role stagnation crosses ~0.6 at the 3-year mark", () => {
    expect(factor(computeDepartureRisk(baseline({ unusedPtoDaysLast12m: 3 })), "burnout").normalized).toBe(0);
    expect(factor(computeDepartureRisk(baseline({ unusedPtoDaysLast12m: 15 })), "burnout").normalized).toBe(1);
    expect(
      factor(computeDepartureRisk(baseline({ monthsInCurrentRole: 36 })), "roleStagnation").normalized,
    ).toBeCloseTo(0.6, 5);
  });

  it("respects recalibrated weights: zeroing a factor removes its contribution", () => {
    const input = baseline({ managerLeftRecently: true });
    const withDomino = computeDepartureRisk(input);
    const withoutDomino = computeDepartureRisk(input, {
      weights: { ...DEFAULT_WEIGHTS, dominoEffect: 0 },
    });
    expect(factor(withoutDomino, "dominoEffect").points).toBe(0);
    expect(withoutDomino.score).toBeLessThan(withDomino.score);
  });
});
