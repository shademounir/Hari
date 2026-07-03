// Trend aggregation (SCRUM-071 control-center). Thin, team-scoped DB reads +
// a PURE bucketing core. The DB half filters strictly by the id sets in a
// `TeamScope` (resolved once by lib/hr.ts); it NEVER computes scope itself, so
// the directoryWhere invariant is preserved. The bucketing core is exported for
// direct unit testing with the mock factory.
import { prisma } from "@/lib/prisma";
import type { TeamScope } from "@/lib/hr";
import type { TrendGranularity, TrendPoint, TrendSeries } from "@/types/dashboard";
import { bucketStart, dayKey, eachDay, MS_PER_DAY } from "@/lib/kpi/time";

export type TrendWindow = {
  start: Date;
  end: Date;
  granularity: TrendGranularity;
};

/** A 90-day window ending today, weekly buckets — the default rolling baseline. */
export function defaultTrendWindow(now: Date): TrendWindow {
  return {
    start: new Date(now.getTime() - 90 * MS_PER_DAY),
    end: now,
    granularity: "week",
  };
}

/**
 * PURE. Count `events` into contiguous buckets across `[start, end]`, emitting a
 * zero-filled point for every bucket (so a quiet week reads as 0, not a gap).
 */
export function bucketCounts(events: Date[], window: TrendWindow): TrendPoint[] {
  const { start, end, granularity } = window;

  // Seed every bucket in range at 0 so the series is dense and gap-free.
  const buckets = new Map<string, number>();
  for (const day of eachDay(start, end)) {
    buckets.set(dayKey(bucketStart(day, start, granularity)), 0);
  }

  for (const at of events) {
    if (at < start || at > end) continue; // scope is by ids; window is by time
    const key = dayKey(bucketStart(at, start, granularity));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([bucketStart, value]) => ({ bucketStart, value }))
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

/** Leave-request volume over time, scoped to the team. */
export async function getLeaveVolumeTrend(
  scope: TeamScope,
  window: TrendWindow,
): Promise<TrendSeries> {
  if (scope.employeeIds.length === 0) {
    return { metric: "leaveVolume", granularity: window.granularity, points: bucketCounts([], window) };
  }
  const rows = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: scope.employeeIds },
      createdAt: { gte: window.start, lte: window.end },
    },
    select: { createdAt: true },
  });
  return {
    metric: "leaveVolume",
    granularity: window.granularity,
    points: bucketCounts(rows.map((r) => r.createdAt), window),
  };
}

/** AI usage (turns or refusals) over time, scoped to the team's users. */
export async function getAiUsageTrend(
  scope: TeamScope,
  window: TrendWindow,
  kind: "TURN" | "REFUSAL",
): Promise<TrendSeries> {
  const metric = kind === "TURN" ? "aiTurns" : "aiRefusals";
  if (scope.userIds.length === 0) {
    return { metric, granularity: window.granularity, points: bucketCounts([], window) };
  }
  const rows = await prisma.aiEvent.findMany({
    where: {
      userId: { in: scope.userIds },
      kind,
      createdAt: { gte: window.start, lte: window.end },
    },
    select: { createdAt: true },
  });
  return {
    metric,
    granularity: window.granularity,
    points: bucketCounts(rows.map((r) => r.createdAt), window),
  };
}
