// Capacity planning (SCRUM-071 control-center): calendar heatmap of team leave
// overlap + a "what-if" impact calculator for the approval flow. The overlap
// math is PURE (unit-tested with the factory); only `getCapacityData` touches
// the DB, and it filters strictly by the team-scoped id set.
import { prisma } from "@/lib/prisma";
import type { TeamScope } from "@/lib/hr";
import type { CapacityImpact, HeatmapCell, HeatmapModel, RiskBand } from "@/types/dashboard";
import { dayKey, eachDay, startOfDayUtc } from "@/lib/kpi/time";

/** An approved (or candidate) absence, day-precision inclusive on both ends. */
export type LeaveInterval = {
  employeeId: string;
  start: Date;
  end: Date;
};

/** Default fraction of the team out-of-office that counts as a coverage breach. */
export const DEFAULT_RISK_THRESHOLD = 0.3;

function bandFor(ratio: number): RiskBand {
  if (ratio <= 0) return "none";
  if (ratio < 0.15) return "low";
  if (ratio < DEFAULT_RISK_THRESHOLD) return "medium";
  return "high";
}

function covers(interval: LeaveInterval, day: Date): boolean {
  const d = startOfDayUtc(day).getTime();
  return startOfDayUtc(interval.start).getTime() <= d && d <= startOfDayUtc(interval.end).getTime();
}

/**
 * PURE. Build a per-day coverage-risk model over `[rangeStart, rangeEnd]`. Each
 * cell counts distinct team members on leave that day; `ratio` is against
 * `teamSize` (guarded so an empty team never divides by zero).
 */
export function buildCapacityHeatmap(
  intervals: LeaveInterval[],
  rangeStart: Date,
  rangeEnd: Date,
  teamSize: number,
): HeatmapModel {
  const size = Math.max(teamSize, 1);
  const cells: HeatmapCell[] = eachDay(rangeStart, rangeEnd).map((day) => {
    const onLeave = new Set(
      intervals.filter((iv) => covers(iv, day)).map((iv) => iv.employeeId),
    ).size;
    const ratio = onLeave / size;
    return { date: dayKey(day), onLeave, ratio, band: bandFor(ratio) };
  });

  const peakRatio = cells.reduce((max, c) => Math.max(max, c.ratio), 0);

  return {
    teamSize,
    rangeStart: dayKey(rangeStart),
    rangeEnd: dayKey(rangeEnd),
    cells,
    peakRatio,
  };
}

/**
 * PURE. Would approving `candidate` breach coverage? Considers only the days the
 * candidate would be absent, counting the candidate plus every already-approved
 * overlap, and reports the worst day. `existing` should exclude the candidate's
 * own pending row.
 */
export function simulateImpact(
  existing: LeaveInterval[],
  candidate: LeaveInterval,
  teamSize: number,
  threshold: number = DEFAULT_RISK_THRESHOLD,
): CapacityImpact {
  const size = Math.max(teamSize, 1);
  let peakOnLeave = 0;
  let worstDate: string | null = null;

  for (const day of eachDay(candidate.start, candidate.end)) {
    const others = new Set(
      existing.filter((iv) => covers(iv, day)).map((iv) => iv.employeeId),
    );
    others.add(candidate.employeeId);
    if (others.size > peakOnLeave) {
      peakOnLeave = others.size;
      worstDate = dayKey(day);
    }
  }

  const peakRatio = peakOnLeave / size;
  return { peakOnLeave, peakRatio, wouldBreach: peakRatio >= threshold, worstDate };
}

/**
 * Team-scoped approved-leave intervals overlapping `[rangeStart, rangeEnd]`.
 * Scope is enforced by the `employeeId IN scope.employeeIds` filter; an empty
 * team returns nothing rather than a global scan.
 */
export async function getCapacityData(
  scope: TeamScope,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<LeaveInterval[]> {
  if (scope.employeeIds.length === 0) return [];
  const rows = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: scope.employeeIds },
      status: "APPROVED",
      // overlap: starts on/before the range end AND ends on/after the range start
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
    },
    select: { employeeId: true, startDate: true, endDate: true },
  });
  return rows.map((r) => ({ employeeId: r.employeeId, start: r.startDate, end: r.endDate }));
}
