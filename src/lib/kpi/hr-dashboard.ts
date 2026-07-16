// ─────────────────────────────────────────────────────────────────────────
// SCRUM-072: the single server-side assembler for the HR company-wide
// dashboard (AI activity + document corpus). Gated by `dashboard:read:company`
// — HR_ADMIN / SUPER_ADMIN only. Composes company-wide AiEvent counts/trends,
// open-alert totals, and document-status counts into one PII-safe view model,
// following the exact pattern of the Team dashboard's `getTeamDashboard`
// (lib/kpi/dashboard.ts) but unscoped (no TeamScope — this is company-wide).
// ─────────────────────────────────────────────────────────────────────────
import type { AiEventKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Caller } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { getAlertStatusCounts } from "@/lib/alerts";
import { getDocumentStatusCounts } from "@/lib/kb";
import { detectAnomaly } from "@/lib/kpi/anomaly";
import { defaultTrendWindow, getCompanyAiEventTrend } from "@/lib/kpi/trends";
import type {
  AnomalyResult,
  DocStatusCounts,
  HrDashboardModel,
  HrKpiCardModel,
  HrKpiKey,
  TrendPoint,
} from "@/types/dashboard";

/** How many days of AI-usage history the dashboard's KPI counts cover. */
const AI_USAGE_WINDOW_DAYS = 7;

const EMPTY_ANOMALY: AnomalyResult = {
  status: "insufficient_data",
  current: 0,
  mean: 0,
  stdDev: 0,
  zScore: 0,
  deltaPct: 0,
};

const EMPTY_DOC_STATUS_COUNTS: DocStatusCounts = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0, all: 0 };

/** Current value = last bucket; baseline = all prior buckets. */
function cardFrom(key: HrKpiKey, value: number, points: TrendPoint[]): HrKpiCardModel {
  if (points.length === 0) {
    return { key, value, series: [], anomaly: { ...EMPTY_ANOMALY, current: value } };
  }
  const history = points.slice(0, -1).map((p) => p.value);
  const current = points[points.length - 1].value;
  return { key, value, series: points, anomaly: detectAnomaly(history, current) };
}

/**
 * Assemble the HR dashboard for `caller`. Returns an empty (but well-typed)
 * model when the caller lacks `dashboard:read:company`, so the page can render
 * a consistent shell without special-casing authorization.
 */
export async function getHrDashboard(caller: Caller, now: Date): Promise<HrDashboardModel> {
  if (!can(caller, "dashboard:read:company")) {
    return { kpis: [], refusalRatePct: 0, docStatusCounts: EMPTY_DOC_STATUS_COUNTS };
  }

  const since = new Date(now.getTime() - AI_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const window = defaultTrendWindow(now);

  const [kindCounts, turnsTrend, refusalsTrend, errorsTrend, alertCounts, docStatusCounts] =
    await Promise.all([
      prisma.aiEvent.groupBy({
        by: ["kind"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      getCompanyAiEventTrend(window, "TURN"),
      getCompanyAiEventTrend(window, "REFUSAL"),
      getCompanyAiEventTrend(window, "ERROR"),
      getAlertStatusCounts(caller),
      getDocumentStatusCounts(caller),
    ]);

  const kindCount = (k: AiEventKind): number =>
    kindCounts.find((r) => r.kind === k)?._count._all ?? 0;

  const aiQuestions7d = kindCount("TURN");
  const aiRefusals7d = kindCount("REFUSAL");
  const aiErrors7d = kindCount("ERROR");
  const openAlerts = alertCounts.OPEN + alertCounts.ACKNOWLEDGED;

  // Share of refusals among all classified turns over the window. 0 when there's
  // nothing to divide by, rather than NaN.
  const refusalRatePct =
    aiQuestions7d + aiRefusals7d > 0
      ? Math.round((aiRefusals7d / (aiQuestions7d + aiRefusals7d)) * 100)
      : 0;

  const kpis: HrKpiCardModel[] = [
    cardFrom("aiQuestions7d", aiQuestions7d, turnsTrend),
    cardFrom("aiRefusals7d", aiRefusals7d, refusalsTrend),
    cardFrom("aiErrors7d", aiErrors7d, errorsTrend),
    // Point-in-time backlog with no historical snapshots — value only, no series.
    { key: "openAlerts", value: openAlerts, series: [], anomaly: { ...EMPTY_ANOMALY, current: openAlerts } },
  ];

  return { kpis, refusalRatePct, docStatusCounts };
}
