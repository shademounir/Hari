import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { resolveCaller } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { getEngagementDashboard } from "@/lib/engagement/data-layer";
import { PageHeader } from "@/components/layout/page-header";
import { EngagementMetrics } from "@/components/engagement/engagement-metrics";
import { QuadrantChart } from "@/components/engagement/quadrant-chart";
import { EngagementTable } from "@/components/engagement/engagement-table";

// RSC-first: the read goes through the scope-enforced, self-excluding data layer.
// Gated to managers (engagement:read:team); the subject NEVER appears in their own
// manager's view (self-exclusion) and can never reach this page (no permission).
export default async function TeamEngagementPage() {
  const user = await requireUser();
  if (!can(user.role, "engagement:read:team")) redirect("/");

  const caller = await resolveCaller(user);
  const t = await getTranslations("engagement");

  const rows = await getEngagementDashboard(caller);
  const canInput = can(user.role, "engagement:input");
  const points = rows.map((r) => ({
    name: r.name,
    department: r.department,
    exhaustion: r.exhaustion,
    disengagement: r.disengagement,
    score: r.score,
    quadrant: r.quadrant,
  }));

  return (
    <>
      <PageHeader title={t("teamTitle")} description={t("teamDescription")} />

      <div className="space-y-6 p-4 md:p-8">
        <EngagementMetrics rows={rows} />

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

        <section className="card-elevated rounded-2xl border bg-card p-5 md:p-6">
          <h2 className="mb-1 text-base font-semibold">{t("table.title")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("table.description")}</p>
          <EngagementTable rows={rows} canInput={canInput} />
        </section>
      </div>
    </>
  );
}
