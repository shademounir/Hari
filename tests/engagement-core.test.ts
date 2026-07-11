import { describe, it, expect } from "vitest";
import {
  computeEngagement,
  DEFAULT_ENGAGEMENT_CONFIG,
  MIN_TENURE_DAYS,
  SIGNAL_KEYS,
  type EngagementInput,
} from "@/lib/engagement/engagement";

// A fully-healthy, fully-covered baseline; individual tests override single fields.
// Tenure is well past the confidence floor and every signal has data.
function healthy(overrides: Partial<EngagementInput> = {}): EngagementInput {
  return {
    tenureDays: 900,
    absenceSpike: 0, // no spike
    unplannedLeaveCount: 0,
    taskLatencyRatio: 1.0, // on par
    afterHoursRatio: 0.05,
    unusedPtoRatio: 0.1,
    assistantUsageDrop: 0,
    daysSinceLastOneOnOne: 14, // recent 1:1
    monthsInRole: 8,
    workQuality: 5,
    participation: 5,
    peerInteraction: 5,
    ...overrides,
  };
}

const factor = (r: ReturnType<typeof computeEngagement>, key: string) =>
  r.factors.find((f) => f.key === key);

describe("computeEngagement — configuration & additive invariant", () => {
  it("default config: eleven signals, baseline lands a neutral employee in GREEN", () => {
    expect(SIGNAL_KEYS).toHaveLength(11);
    // A neutral employee: no risk signals, qualitative at the neutral 3/5.
    const r = computeEngagement(
      healthy({ workQuality: 3, participation: 3, peerInteraction: 3 }),
    );
    // Only the baseline (+ zero-ish contributions) → GREEN.
    expect(r.band).toBe("GREEN");
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_ENGAGEMENT_CONFIG.thresholds.greenMin);
  });

  it("the additive factors sum exactly to the score (XAI waterfall reconciles)", () => {
    const r = computeEngagement(
      healthy({
        absenceSpike: 0.6,
        daysSinceLastOneOnOne: 90,
        workQuality: 2,
        participation: 2,
      }),
    );
    const sum = r.factors.reduce((s, f) => s + f.points, 0);
    expect(Math.round(sum)).toBe(r.score);
    // Baseline is always the first factor and carries the config baseline.
    expect(r.factors[0].key).toBe("baseline");
    expect(r.factors[0].points).toBe(DEFAULT_ENGAGEMENT_CONFIG.baseline);
  });

  it("good manager ratings ADD points; risk signals SUBTRACT them", () => {
    const r = computeEngagement(healthy({ absenceSpike: 0.8 }));
    expect(factor(r, "workQuality")!.points).toBeGreaterThan(0); // 5/5 boosts
    expect(factor(r, "absenceSpike")!.points).toBeLessThan(0); // spike penalizes
  });

  it("score stays within 0..100 and clamps under an all-max-risk profile", () => {
    const r = computeEngagement({
      tenureDays: 900,
      absenceSpike: 2,
      unplannedLeaveCount: 8,
      taskLatencyRatio: 3,
      afterHoursRatio: 0.9,
      unusedPtoRatio: 1,
      assistantUsageDrop: 1,
      daysSinceLastOneOnOne: 200,
      monthsInRole: 80,
      workQuality: 1,
      participation: 1,
      peerInteraction: 1,
    });
    expect(r.score).toBe(0);
    expect(r.band).toBe("RED");
  });
});

describe("computeEngagement — confidence gate (new hires)", () => {
  it("a new hire with no signal history yields LOW confidence, not a bad score", () => {
    const r = computeEngagement({
      tenureDays: 20, // under the 6-week floor
      absenceSpike: null,
      unplannedLeaveCount: null,
      taskLatencyRatio: null,
      afterHoursRatio: null,
      unusedPtoRatio: null,
      assistantUsageDrop: null,
      daysSinceLastOneOnOne: null,
      monthsInRole: null,
      workQuality: null,
      participation: null,
      peerInteraction: null,
    });
    expect(r.confidence).toBe("LOW");
    expect(r.dataCoverage).toBe(0);
    // No signals → only the baseline factor, and it must NOT read as at-risk.
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].key).toBe("baseline");
    expect(r.band).toBe("GREEN");
    expect(r.quadrant).toBe("ENGAGED");
  });

  it("tenured but thin coverage → MEDIUM; full coverage → HIGH", () => {
    const partial = computeEngagement({
      tenureDays: 400,
      absenceSpike: 0.3,
      unplannedLeaveCount: 1,
      daysSinceLastOneOnOne: 30,
      workQuality: 4,
      participation: 4,
      // the remaining six signals are unknown
      taskLatencyRatio: null,
      afterHoursRatio: null,
      unusedPtoRatio: null,
      assistantUsageDrop: null,
      monthsInRole: null,
      peerInteraction: null,
    });
    expect(partial.dataCoverage).toBeLessThan(70);
    expect(partial.dataCoverage).toBeGreaterThanOrEqual(40);
    expect(partial.confidence).toBe("MEDIUM");

    const full = computeEngagement(healthy());
    expect(full.dataCoverage).toBe(100);
    expect(full.confidence).toBe("HIGH");
  });

  it("just past the tenure floor with full coverage is no longer LOW", () => {
    const r = computeEngagement(healthy({ tenureDays: MIN_TENURE_DAYS + 1 }));
    expect(r.confidence).not.toBe("LOW");
  });
});

describe("computeEngagement — 2-D quadrant diagnosis", () => {
  it("an engaged profile maps to the bottom-left (ENGAGED) with a GREEN score", () => {
    const r = computeEngagement(healthy());
    expect(r.quadrant).toBe("ENGAGED");
    expect(r.exhaustion).toBeLessThan(50);
    expect(r.disengagement).toBeLessThan(50);
    expect(r.band).toBe("GREEN");
    expect(r.score).toBeGreaterThan(90);
  });

  it("a burnout profile maps to the top-right (BURNOUT): high on BOTH axes", () => {
    const r = computeEngagement(
      healthy({
        absenceSpike: 0.8,
        unplannedLeaveCount: 4,
        taskLatencyRatio: 1.8,
        afterHoursRatio: 0.45,
        unusedPtoRatio: 0.7,
        assistantUsageDrop: 0.8,
        daysSinceLastOneOnOne: 100,
        monthsInRole: 40,
        workQuality: 2,
        participation: 2,
        peerInteraction: 2,
      }),
    );
    expect(r.exhaustion).toBeGreaterThanOrEqual(50);
    expect(r.disengagement).toBeGreaterThanOrEqual(50);
    expect(r.quadrant).toBe("BURNOUT");
    expect(["ORANGE", "RED"]).toContain(r.band);
  });

  it("a boreout profile maps to the bottom-right (BOREOUT): LOW exhaustion, HIGH disengagement", () => {
    const r = computeEngagement(
      healthy({
        // exhaustion signals all healthy → low exhaustion
        absenceSpike: 0,
        unplannedLeaveCount: 0,
        taskLatencyRatio: 1.0,
        afterHoursRatio: 0.05,
        unusedPtoRatio: 0.1,
        // disengagement signals elevated → under-stimulated / withdrawn
        assistantUsageDrop: 0.7,
        daysSinceLastOneOnOne: 110,
        monthsInRole: 55, // long time in an unchanged role
        workQuality: 3,
        participation: 2,
        peerInteraction: 2,
      }),
    );
    expect(r.exhaustion).toBeLessThan(50);
    expect(r.disengagement).toBeGreaterThanOrEqual(50);
    expect(r.quadrant).toBe("BOREOUT");
  });

  it("a strained profile maps to the top-left (STRAINED): HIGH exhaustion, LOW disengagement", () => {
    const r = computeEngagement(
      healthy({
        // overloaded...
        absenceSpike: 0.7,
        unplannedLeaveCount: 3,
        taskLatencyRatio: 1.7,
        afterHoursRatio: 0.5,
        unusedPtoRatio: 0.8,
        // ...but still connected + performing (low disengagement)
        assistantUsageDrop: 0,
        daysSinceLastOneOnOne: 10,
        monthsInRole: 6,
        workQuality: 5,
        participation: 5,
        peerInteraction: 5,
      }),
    );
    expect(r.exhaustion).toBeGreaterThanOrEqual(50);
    expect(r.disengagement).toBeLessThan(50);
    expect(r.quadrant).toBe("STRAINED");
  });
});

describe("computeEngagement — explainability surfaces the real drivers", () => {
  it("factors are sorted with the biggest drag first (after the baseline)", () => {
    const r = computeEngagement(
      healthy({ absenceSpike: 0.9, daysSinceLastOneOnOne: 120, workQuality: 2 }),
    );
    expect(r.factors[0].key).toBe("baseline");
    // Everything after the baseline is ascending by points (most negative first).
    for (let i = 2; i < r.factors.length; i++) {
      expect(r.factors[i - 1].points).toBeLessThanOrEqual(r.factors[i].points);
    }
    // The single worst driver is a genuine risk signal, not the baseline.
    expect(r.factors[1].points).toBeLessThan(0);
  });

  it("each shown factor carries the raw value it read (for the 'why' panel)", () => {
    const r = computeEngagement(healthy({ daysSinceLastOneOnOne: 95 }));
    expect(factor(r, "oneOnOneGap")!.rawValue).toBe(95);
    // A null signal is omitted entirely rather than shown as neutral.
    const r2 = computeEngagement(healthy({ daysSinceLastOneOnOne: null }));
    expect(factor(r2, "oneOnOneGap")).toBeUndefined();
  });
});
