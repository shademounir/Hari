import { describe, it, expect } from "vitest";
import { bucketStart, daysBetween, eachDay } from "@/lib/kpi/time";
import { bucketCounts, type TrendWindow } from "@/lib/kpi/trends";
import { detectAnomaly } from "@/lib/kpi/anomaly";
import { buildCapacityHeatmap, simulateImpact, type LeaveInterval } from "@/lib/kpi/capacity";
import { buildDashboardFixture } from "./factories/dashboard";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("kpi/time", () => {
  it("daysBetween + eachDay are inclusive and consistent", () => {
    expect(daysBetween(d("2026-01-01"), d("2026-01-08"))).toBe(7);
    expect(eachDay(d("2026-01-01"), d("2026-01-03"))).toHaveLength(3);
    expect(daysBetween(d("2026-01-10"), d("2026-01-01"))).toBe(-9);
  });

  it("bucketStart anchors weeks to rangeStart and months to the 1st", () => {
    const start = d("2026-01-01");
    expect(bucketStart(d("2026-01-05"), start, "week").toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(bucketStart(d("2026-01-09"), start, "week").toISOString().slice(0, 10)).toBe("2026-01-08");
    expect(bucketStart(d("2026-03-17"), start, "month").toISOString().slice(0, 10)).toBe("2026-03-01");
  });
});

describe("kpi/trends bucketCounts (pure)", () => {
  const window: TrendWindow = { start: d("2026-01-01"), end: d("2026-01-28"), granularity: "week" };

  it("is dense and zero-filled across the whole window", () => {
    const points = bucketCounts([], window);
    expect(points).toHaveLength(4); // four 7-day buckets
    expect(points.every((p) => p.value === 0)).toBe(true);
    // sorted ascending by bucket start
    expect(points.map((p) => p.bucketStart)).toEqual([...points.map((p) => p.bucketStart)].sort());
  });

  it("counts events into the right bucket and ignores out-of-window events", () => {
    const events = [d("2026-01-02"), d("2026-01-03"), d("2026-01-10"), d("2025-12-31"), d("2026-02-05")];
    const points = bucketCounts(events, window);
    expect(points[0].value).toBe(2); // week of Jan 1
    expect(points[1].value).toBe(1); // week of Jan 8
    expect(points.reduce((a, p) => a + p.value, 0)).toBe(3); // two out-of-window dropped
  });
});

describe("kpi/anomaly detectAnomaly (pure)", () => {
  it("reports insufficient_data below minSamples", () => {
    expect(detectAnomaly([1, 2], 9).status).toBe("insufficient_data");
  });

  it("classifies a value inside the baseline as normal", () => {
    expect(detectAnomaly([10, 11, 9, 10, 10], 10).status).toBe("normal");
  });

  it("flags a strong positive deviation as high", () => {
    const r = detectAnomaly([2, 3, 2, 3, 2, 3], 20);
    expect(r.status).toBe("high");
    expect(r.zScore).toBeGreaterThan(2.5);
    expect(r.deltaPct).toBeGreaterThan(0);
  });

  it("uses the percentage rule on a flat baseline", () => {
    expect(detectAnomaly([5, 5, 5, 5], 5).status).toBe("normal");
    expect(detectAnomaly([5, 5, 5, 5], 12).status).toBe("high"); // +140%
    expect(detectAnomaly([5, 5, 5, 5], 8).status).toBe("elevated"); // +60%
  });

  it("treats collapses as anomalies too (direction-agnostic)", () => {
    expect(detectAnomaly([20, 22, 19, 21, 20], 2).status).toBe("high");
  });
});

describe("kpi/capacity (pure)", () => {
  const team = 4;
  const intervals: LeaveInterval[] = [
    { employeeId: "a", start: d("2026-02-02"), end: d("2026-02-04") },
    { employeeId: "b", start: d("2026-02-03"), end: d("2026-02-03") },
    { employeeId: "c", start: d("2026-02-10"), end: d("2026-02-10") },
  ];

  it("counts distinct overlaps per day and computes ratio + band", () => {
    const m = buildCapacityHeatmap(intervals, d("2026-02-01"), d("2026-02-05"), team);
    const feb3 = m.cells.find((c) => c.date === "2026-02-03")!;
    expect(feb3.onLeave).toBe(2); // a + b
    expect(feb3.ratio).toBeCloseTo(0.5);
    expect(feb3.band).toBe("high"); // >= 0.3 threshold
    expect(m.peakRatio).toBeCloseTo(0.5);
  });

  it("never divides by zero for an empty team", () => {
    const m = buildCapacityHeatmap([], d("2026-02-01"), d("2026-02-02"), 0);
    expect(m.cells.every((c) => c.ratio === 0 && c.band === "none")).toBe(true);
  });

  it("simulateImpact flags a breach and names the worst day", () => {
    const candidate: LeaveInterval = { employeeId: "d", start: d("2026-02-03"), end: d("2026-02-03") };
    const impact = simulateImpact(intervals, candidate, team);
    expect(impact.peakOnLeave).toBe(3); // a, b + candidate d
    expect(impact.peakRatio).toBeCloseTo(0.75);
    expect(impact.wouldBreach).toBe(true);
    expect(impact.worstDate).toBe("2026-02-03");
  });

  it("simulateImpact stays within bounds for a quiet span", () => {
    const candidate: LeaveInterval = { employeeId: "d", start: d("2026-02-20"), end: d("2026-02-20") };
    const impact = simulateImpact(intervals, candidate, team);
    expect(impact.peakOnLeave).toBe(1); // only the candidate
    expect(impact.wouldBreach).toBe(false);
  });
});

describe("mock factory feeds the calculators end-to-end", () => {
  const fx = buildDashboardFixture({ seed: 7 });

  it("produces a 6-month scoped dataset with overlaps and a refusal spike", () => {
    expect(fx.employeeIds).toHaveLength(8);
    expect(fx.leaveIntervals.length).toBeGreaterThan(8);

    const heatmap = buildCapacityHeatmap(fx.leaveIntervals, fx.rangeStart, fx.rangeEnd, fx.employeeIds.length);
    expect(heatmap.cells.length).toBeGreaterThan(150);
    expect(heatmap.peakRatio).toBeGreaterThan(0); // holiday cluster creates overlap

    // Weekly refusal buckets: the final week should read as an anomaly vs history.
    const window: TrendWindow = { start: fx.rangeStart, end: fx.rangeEnd, granularity: "week" };
    const points = bucketCounts(fx.aiRefusalDates, window);
    const history = points.slice(0, -1).map((p) => p.value);
    const current = points[points.length - 1].value;
    expect(["elevated", "high"]).toContain(detectAnomaly(history, current).status);
  });

  it("is deterministic for a fixed seed", () => {
    const a = buildDashboardFixture({ seed: 99 });
    const b = buildDashboardFixture({ seed: 99 });
    expect(a.leaveIntervals).toEqual(b.leaveIntervals);
    expect(a.aiRefusalDates).toEqual(b.aiRefusalDates);
  });
});
