import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Users, CalendarX2, TrendingDown, Wallet, Timer } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getRoleLabels } from "@/lib/rbac-server";
import { can } from "@/lib/rbac";
import { getOrgSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/utils";
import { getHrAnalyticsCached } from "@/lib/analytics";
import { parseAnalyticsFilters } from "@/lib/analytics/scope";
import { PageHeader } from "@/components/layout/page-header";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";
import { KpiCard, ChartCard } from "@/components/analytics/cards";
import {
  AgePyramidChart,
  CategoryBarChart,
  DistributionPie,
  GENDER_COLORS,
  MultiLineChart,
} from "@/components/charts/analytics";

// Server Component: every read goes through the RBAC-gated analytics layer
// (getHrAnalytics returns null unless the caller holds analytics:full). View
// models carry aggregates only — no per-person salary.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "analytics:full")) redirect("/");

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  const filters = parseAnalyticsFilters(sp);
  const qs = sp.toString();
  const exportHref = (section: string) =>
    `/api/analytics/export?section=${section}${qs ? `&${qs}` : ""}`;

  const [t, tLeave, tReason, tGender, locale, org] = await Promise.all([
    getTranslations("hrAnalytics"),
    getTranslations("leaveType"),
    getTranslations("hrAnalytics.departureReason"),
    getTranslations("hrAnalytics.gender"),
    getLocale(),
    getOrgSettings(),
  ]);
  const tSalary = await getTranslations("hrAnalytics.salaryBand");
  const tTenure = await getTranslations("hrAnalytics.tenure");
  // Diversity is broken down by role ("level"), which may include custom roles.
  const roleLabels = await getRoleLabels(await getTranslations("roles"));

  const model = await getHrAnalyticsCached(user, filters);
  if (!model) redirect("/");

  const money = (v: number) => formatCurrency(v, org.currency, locale);
  const monthLabel = (m: string) => m.slice(2); // "YYYY-MM" → "YY-MM" for compact axes
  const { overview, absenteeism, turnover, payroll, diversity, reviews } = model;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")}>
        <a
          href={exportHref("overview")}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {t("exportCsv")}
        </a>
      </PageHeader>

      <div className="space-y-6 p-4 md:p-8">
        <AnalyticsFilterBar departments={model.departments} />

        {/* Section 1 — overview KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label={t("kpi.headcount")}
            value={String(overview.headcount.value)}
            icon={Users}
            deltaPct={overview.headcount.deltaPct}
            deltaLabel={t("kpi.vsPrevMonth")}
          />
          <KpiCard
            label={t("kpi.absenteeism")}
            value={`${overview.absenteeismPct.value}%`}
            icon={CalendarX2}
            deltaPct={overview.absenteeismPct.deltaPct}
            deltaLabel={t("kpi.vsLastYear")}
            invertDelta
          />
          <KpiCard label={t("kpi.turnover")} value={`${overview.turnoverPct}%`} icon={TrendingDown} />
          {overview.monthlyPayroll && (
            <KpiCard
              label={t("kpi.payroll")}
              value={money(overview.monthlyPayroll.value)}
              icon={Wallet}
              deltaPct={overview.monthlyPayroll.deltaPct}
              deltaLabel={t("kpi.vsPrevMonth")}
            />
          )}
          <KpiCard
            label={t("kpi.timeToHire")}
            value={`${overview.avgTimeToHireDays} ${t("kpi.days")}`}
            icon={Timer}
          />
        </div>

        {/* Section 2 — absenteeism */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("absenteeism.byMonth")} exportHref={exportHref("absenteeism")} exportLabel={t("exportCsv")}>
            <CategoryBarChart
              data={absenteeism.byMonth.map((p) => ({ label: monthLabel(p.month), value: p.value }))}
              series={[{ key: "value", label: t("absenteeism.rate") }]}
            />
          </ChartCard>
          <ChartCard title={t("absenteeism.byType")}>
            <DistributionPie data={absenteeism.byType.map((s) => ({ label: tLeave(s.key as "VACATION"), value: s.value }))}
              emptyLabel={t("noData")}
            />
          </ChartCard>
          <ChartCard title={t("absenteeism.topDepartments")} className="lg:col-span-2">
            <CategoryBarChart
              layout="horizontal"
              data={absenteeism.topDepartments.map((d) => ({ label: d.department, value: d.ratePct }))}
              series={[{ key: "value", label: t("absenteeism.rate") }]}
              emptyLabel={t("noData")}
            />
          </ChartCard>
        </div>

        {/* Section 3 — turnover */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("turnover.trend")} exportHref={exportHref("turnover")} exportLabel={t("exportCsv")} className="lg:col-span-2">
            <MultiLineChart
              data={turnover.byMonth.map((p) => ({ label: monthLabel(p.month), value: p.value }))}
              series={[{ key: "value", label: t("turnover.departures") }]}
            />
          </ChartCard>
          <ChartCard title={t("turnover.byReason")}>
            <DistributionPie data={turnover.byReason.map((s) => ({ label: tReason(s.key as "VOLUNTARY"), value: s.value }))}
              emptyLabel={t("noData")}
            />
          </ChartCard>
          <ChartCard title={t("turnover.byTenure")}>
            <DistributionPie data={turnover.byTenure.map((s) => ({ label: tTenure(s.key as "lt1y"), value: s.value }))}
              emptyLabel={t("noData")}
            />
          </ChartCard>
        </div>

        {/* Section 4 — payroll */}
        {payroll && (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title={t("payroll.trend")} exportHref={exportHref("payroll")} exportLabel={t("exportCsv")} className="lg:col-span-2">
              <MultiLineChart
                data={payroll.byMonth.map((p) => ({ label: monthLabel(p.month), value: p.value }))}
                series={[{ key: "value", label: t("payroll.title") }]}
              />
            </ChartCard>
            <ChartCard title={t("payroll.byBand")}>
              <CategoryBarChart
                data={payroll.byBand.map((s) => ({ label: tSalary(s.key as "lt120k"), value: s.value }))}
                series={[{ key: "value", label: t("payroll.byBand") }]}
              />
            </ChartCard>
            <ChartCard title={t("payroll.byDepartment")}>
              <CategoryBarChart
                layout="horizontal"
                data={payroll.byDepartment.map((s) => ({ label: s.key, value: s.value }))}
                series={[{ key: "value", label: t("payroll.currentMonth") }]}
                emptyLabel={t("noData")}
              />
            </ChartCard>
          </div>
        )}

        {/* Section 5 — age pyramid + diversity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("diversity.agePyramid")}>
            <AgePyramidChart
              data={diversity.ageBands}
              femaleLabel={tGender("FEMALE")}
              maleLabel={tGender("MALE")}
            />
          </ChartCard>
          <ChartCard title={t("diversity.genderByLevel")}>
            <CategoryBarChart
              stacked
              data={diversity.genderByLevel.map((r) => ({
                label: roleLabels[r.level] ?? r.level,
                female: r.female,
                male: r.male,
                other: r.other,
              }))}
              series={[
                { key: "female", label: tGender("FEMALE"), color: GENDER_COLORS.female },
                { key: "male", label: tGender("MALE"), color: GENDER_COLORS.male },
                // Only surface "Other" when someone actually falls in it — otherwise
                // it's a dead legend entry.
                ...(diversity.genderByLevel.some((r) => r.other > 0)
                  ? [{ key: "other", label: tGender("OTHER"), color: GENDER_COLORS.other }]
                  : []),
              ]}
            />
          </ChartCard>
        </div>

        {/* Section 6 — annual reviews */}
        <ChartCard
          title={t("reviews.title")}
          exportHref={exportHref("reviews")}
          exportLabel={t("exportCsv")}
        >
          <p className="mb-4 text-sm text-muted-foreground">
            {t("reviews.coverage")}:{" "}
            <span className="font-semibold text-foreground tabular-nums">{reviews.reviewedThisYearPct}%</span>
          </p>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("reviews.overdue")}
          </h3>
          {reviews.overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reviews.allDone")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">{t("reviews.employee")}</th>
                    <th className="py-2 font-medium">{t("reviews.department")}</th>
                    <th className="py-2 font-medium">{t("reviews.lastReview")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.overdue.map((r) => (
                    <tr key={r.employeeId} className="border-b last:border-0">
                      <td className="py-2">{r.name}</td>
                      <td className="py-2 text-muted-foreground">{r.department}</td>
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {r.lastReviewedAt ?? t("reviews.never")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}
