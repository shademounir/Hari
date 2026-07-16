import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  getEngagementDashboard,
  getEngagementTrend,
  type EngagementDashboardRow,
} from "@/lib/engagement/data-layer";
import type { EngagementBand } from "@/lib/engagement/engagement";
import { PageHeader } from "@/components/layout/page-header";
import { EngagementMetrics } from "@/components/engagement/engagement-metrics";
import { EngagementFilterBar } from "@/components/engagement/engagement-filter-bar";
import { QuadrantChart } from "@/components/engagement/quadrant-chart";
import { EngagementTrendChart } from "@/components/engagement/engagement-trend-chart";
import {
  EngagementDistributionChart,
  type DistributionRow,
} from "@/components/engagement/engagement-distribution-chart";
import { EngagementTable } from "@/components/engagement/engagement-table";
import { EngagementPagination } from "@/components/engagement/engagement-pagination";

const BANDS: EngagementBand[] = ["GREEN", "YELLOW", "ORANGE", "RED"];
const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

type Props = {
  searchParams: Promise<{
    dept?: string | string[];
    band?: string | string[];
    manager?: string;
    q?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

// RSC-first: the read is scope-enforced + self-excluding. All filtering, sorting and
// pagination happen server-side from the URL, so the view is bookmarkable and only
// the filter bar is a Client Component. Filters can only narrow within the caller's
// RBAC scope (a manager's own reports).
export default async function TeamEngagementPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!can(user, "engagement:read:team")) redirect("/");

  const caller = user;
  const t = await getTranslations("engagement");
  const params = await searchParams;
  const now = new Date();

  const all = await getEngagementDashboard(caller);
  const canInput = can(user, "engagement:input");

  // Filter option sources (within scope).
  const departments = [...new Set(all.map((r) => r.department))].sort();
  const managers = [...new Set(all.map((r) => r.managerName).filter((m): m is string => !!m))].sort();

  // ── URL-driven filtering ──────────────────────────────────────────────
  const deptF = asArray(params.dept).filter((d) => departments.includes(d));
  const bandF = asArray(params.band).filter((b): b is EngagementBand => (BANDS as string[]).includes(b));
  const managerF = params.manager && managers.includes(params.manager) ? params.manager : undefined;
  const q = (params.q ?? "").trim().toLowerCase();

  let filtered = all;
  if (deptF.length) filtered = filtered.filter((r) => deptF.includes(r.department));
  if (bandF.length) filtered = filtered.filter((r) => bandF.includes(r.band));
  if (managerF) filtered = filtered.filter((r) => r.managerName === managerF);
  if (q) filtered = filtered.filter((r) => r.name.toLowerCase().includes(q));

  // ── Sorting ──────────────────────────────────────────────────────────
  const sort = params.sort ?? "risk";
  const sorted = [...filtered];
  if (sort === "scoreDesc") sorted.sort((a, b) => b.score - a.score);
  else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "momentum")
    sorted.sort((a, b) => (a.momentum ?? 0) - (b.momentum ?? 0)); // most declining first
  else sorted.sort((a, b) => a.score - b.score); // "risk" — most at-risk first (default)

  // ── Charts (over the filtered set) ────────────────────────────────────
  const points = sorted.map((r) => ({
    name: r.name,
    department: r.department,
    exhaustion: r.exhaustion,
    disengagement: r.disengagement,
    score: r.score,
    quadrant: r.quadrant,
  }));
  const distribution = buildDistribution(filtered);
  const trend = await getEngagementTrend(filtered.map((r) => r.employeeId), now, 26);

  // ── Pagination ───────────────────────────────────────────────────────
  const pageSize = Math.min(50, Math.max(5, Number(params.pageSize) || 10));
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageHeader title={t("teamTitle")} description={t("teamDescription")} />

      <div className="space-y-6 p-4 md:p-8">
        <EngagementMetrics rows={filtered} />

        {/* Global filter bar */}
        <EngagementFilterBar departments={departments} managers={managers} />

        <section className="card-elevated rounded-2xl border bg-card p-5 md:p-6">
          <h2 className="mb-1 text-base font-semibold">{t("quadrant.title")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("quadrant.description")}</p>
          {points.length > 0 ? (
            <QuadrantChart points={points} />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("noData")}
            </p>
          )}
        </section>

        {/* Two new analytics charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <EngagementTrendChart points={trend} />
          <EngagementDistributionChart data={distribution} />
        </div>

        <section className="card-elevated rounded-2xl border bg-card p-5 md:p-6">
          <h2 className="mb-1 text-base font-semibold">{t("table.title")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("table.description")}</p>
          <EngagementTable rows={pageRows} canInput={canInput} />
          <EngagementPagination
            page={page}
            pageCount={pageCount}
            total={sorted.length}
            pageSize={pageSize}
            params={params}
          />
        </section>
      </div>
    </>
  );
}

function buildDistribution(rows: EngagementDashboardRow[]): DistributionRow[] {
  const map = new Map<string, DistributionRow>();
  for (const r of rows) {
    const d =
      map.get(r.department) ??
      { department: r.department, ENGAGED: 0, BOREOUT: 0, STRAINED: 0, BURNOUT: 0 };
    d[r.quadrant] += 1;
    map.set(r.department, d);
  }
  return [...map.values()].sort((a, b) => a.department.localeCompare(b.department));
}
