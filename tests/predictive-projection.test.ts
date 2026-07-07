import { describe, it, expect } from "vitest";
import { projectDepartures } from "@/lib/predictive/projection";

describe("projectDepartures (12-month departure projection)", () => {
  it("returns one point per month with a monotonic non-decreasing cumulative", () => {
    const { points } = projectDepartures([80, 50, 30, 10], 12);
    expect(points).toHaveLength(12);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].cumulative).toBeGreaterThanOrEqual(points[i - 1].cumulative);
      expect(points[i].expected).toBeGreaterThanOrEqual(0);
    }
  });

  it("a workforce with zero risk projects zero departures", () => {
    const { points, totalExpected } = projectDepartures([0, 0, 0], 12);
    expect(totalExpected).toBe(0);
    expect(points.every((p) => p.expected === 0)).toBe(true);
  });

  it("total expected never exceeds headcount and rises with risk", () => {
    const low = projectDepartures([20, 20, 20, 20]).totalExpected;
    const high = projectDepartures([90, 90, 90, 90]).totalExpected;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(4); // can't lose more than everyone
  });

  it("front-loads higher risk: a max-risk cohort departs faster early on", () => {
    const { points } = projectDepartures([100, 100], 12);
    // With p=1 (annual), month 1 already carries the largest single-month expectation.
    expect(points[0].expected).toBeGreaterThan(points[11].expected);
  });
});
