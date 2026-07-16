// ─────────────────────────────────────────────────────────────────────────
// SCRUM-071 control-center: the single server-side assembler for the Team
// dashboard. Resolves scope ONCE via lib/hr.ts, then composes the KPI counts,
// trend series, anomaly verdicts, and capacity heatmap into one PII-safe view
// model. The page calls only this — it never touches Prisma or the individual
// KPI services directly. Everything stays bounded by the caller's TeamScope.
// ─────────────────────────────────────────────────────────────────────────
import type { Caller } from "@/lib/hr";
import { getTeamKpis, getTeamScope, type TeamScope } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { detectAnomaly } from "@/lib/kpi/anomaly";
import { buildCapacityHeatmap, getCapacityData } from "@/lib/kpi/capacity";
import { defaultTrendWindow, getAiUsageTrend } from "@/lib/kpi/trends";
import { addDays, startOfDayUtc } from "@/lib/kpi/time";
import type {
  AnomalyResult,
  KpiCardModel,
  KpiKey,
  TeamDashboardModel,
  TrendPoint,
} from "@/types/dashboard";

/** How many days ahead the capacity heatmap looks (leave-overlap risk). */
const CAPACITY_HORIZON_DAYS = 45;

const EMPTY_ANOMALY: AnomalyResult = {
  status: "insufficient_data",
  current: 0,
  mean: 0,
  stdDev: 0,
  zScore: 0,
  deltaPct: 0,
};

/** Current value = last bucket; baseline = all prior buckets. */
function cardFrom(key: KpiKey, value: number, points: TrendPoint[]): KpiCardModel {
  if (points.length === 0) {
    return { key, value, series: [], anomaly: { ...EMPTY_ANOMALY, current: value } };
  }
  const history = points.slice(0, -1).map((p) => p.value);
  const current = points[points.length - 1].value;
  return { key, value, series: points, anomaly: detectAnomaly(history, current) };
}

/**
 * Assemble the whole dashboard for `caller`. Returns an empty (but well-typed)
 * model when the caller lacks `dashboard:read:team`, so the page can render a
 * consistent shell without special-casing authorization.
 */
export async function getTeamDashboard(
  caller: Caller,
  now: Date,
  preResolvedScope?: TeamScope,
): Promise<TeamDashboardModel> {
  const scope: TeamScope = preResolvedScope ?? (await getTeamScope(caller));
  // Floor to the UTC day: the capacity query filters day-precision dates, so raw
  // wall-clock `now` would drop a leave whose last day is today (endDate < now).
  const rangeStart = startOfDayUtc(now);
  const rangeEnd = addDays(rangeStart, CAPACITY_HORIZON_DAYS);

  if (!can(caller, "dashboard:read:team") || scope.employeeIds.length === 0) {
    const capacity = buildCapacityHeatmap([], rangeStart, rangeEnd, scope.employeeIds.length);
    return {
      kpis: [],
      capacity,
      capacityRange: { start: capacity.rangeStart, end: capacity.rangeEnd },
    };
  }

  const window = defaultTrendWindow(now);

  const [kpis, turnsTrend, refusalsTrend, capacityIntervals] = await Promise.all([
    getTeamKpis(caller, { scope, now }),
    getAiUsageTrend(scope, window, "TURN"),
    getAiUsageTrend(scope, window, "REFUSAL"),
    getCapacityData(scope, rangeStart, rangeEnd),
  ]);

  const capacity = buildCapacityHeatmap(
    capacityIntervals,
    rangeStart,
    rangeEnd,
    scope.employeeIds.length,
  );

  const cards: KpiCardModel[] = [
    // Headcount has no reliable history (no termination dates) → insufficient_data.
    { key: "headcount", value: kpis.headcount, series: [], anomaly: { ...EMPTY_ANOMALY, current: kpis.headcount } },
    // Point-in-time backlog with no historical snapshots → value only, no
    // series/anomaly (leave-creation volume would be a different quantity).
    { key: "pendingRequests", value: kpis.pendingRequests, series: [], anomaly: { ...EMPTY_ANOMALY, current: kpis.pendingRequests } },
    cardFrom("aiTurns7d", kpis.aiTurns7d, turnsTrend.points),
    cardFrom("aiRefusals7d", kpis.aiRefusals7d, refusalsTrend.points),
  ];

  return {
    kpis: cards,
    capacity,
    capacityRange: { start: capacity.rangeStart, end: capacity.rangeEnd },
  };
}
