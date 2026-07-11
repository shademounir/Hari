import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, CalendarOff, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getTeamAnalytics } from "@/lib/analytics";
import { parseAnalyticsFilters } from "@/lib/analytics/scope";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, ChartCard } from "@/components/analytics/cards";
import { CategoryBarChart, DistributionPie } from "@/components/charts/analytics";

// Manager view — the same data layer, but scoped to the caller's team by
// resolveAnalyticsScope. No payroll section is ever assembled for a manager.
export default async function TeamAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user.role, "analytics:team")) redirect("/");

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  const filters = parseAnalyticsFilters(sp);

  const [t, tLeave] = await Promise.all([
    getTranslations("hrAnalytics"),
    getTranslations("leaveType"),
  ]);

  const caller = { role: user.role, employeeId: user.employeeId };
  const model = await getTeamAnalytics(caller, filters, new Date());
  if (!model) redirect("/");

  return (
    <>
      <PageHeader title={t("teamTitle")} description={t("teamDescription")} />

      <div className="space-y-6 p-4 md:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label={t("team.headcount")} value={String(model.headcount)} icon={Users} />
          <KpiCard label={t("team.onLeave")} value={String(model.onLeaveNow)} icon={CalendarOff} />
          <KpiCard label={t("reviews.reviewsToPlan")} value={String(model.reviewsToPlan)} icon={ClipboardList} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("absenteeism.byMonth")}>
            <CategoryBarChart
              data={model.absenteeism.byMonth.map((p) => ({ label: p.month.slice(2), value: p.value }))}
              series={[{ key: "value", label: t("absenteeism.rate") }]}
            />
          </ChartCard>
          <ChartCard title={t("absenteeism.byType")}>
            <DistributionPie
              data={model.absenteeism.byType.map((s) => ({ label: tLeave(s.key as "VACATION"), value: s.value }))}
              emptyLabel={t("noData")}
            />
          </ChartCard>
        </div>

        <ChartCard title={t("reviews.overdue")}>
          {model.overdueReviews.length === 0 ? (
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
                  {model.overdueReviews.map((r) => (
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
