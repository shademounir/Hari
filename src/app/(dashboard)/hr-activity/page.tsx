import type { ComponentType } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessageCircleQuestion, ShieldAlert, OctagonAlert, BellRing } from "lucide-react";
import { requireUser } from "@/lib/session";
import { resolveCaller } from "@/lib/hr";
import { getHrDashboard } from "@/lib/kpi/hr-dashboard";
import { can } from "@/lib/rbac";
import type { HrKpiKey } from "@/types/dashboard";
import { PageHeader } from "@/components/layout/page-header";
import { Sparkline, Donut, ProgressBar } from "@/components/charts/mini";
import { AnomalyBadge } from "@/components/team/anomaly-badge";

const KPI_ICON: Record<HrKpiKey, ComponentType<{ className?: string }>> = {
  aiQuestions7d: MessageCircleQuestion,
  aiRefusals7d: ShieldAlert,
  aiErrors7d: OctagonAlert,
  openAlerts: BellRing,
};

const DOC_STATUS_ORDER = ["PUBLISHED", "DRAFT", "ARCHIVED"] as const;

// Server Component: every read goes through the role-scoped data layer
// (lib/kpi/hr-dashboard.ts, lib/kb.ts, lib/alerts.ts) — nothing here queries
// Prisma directly, and the view model carries counts/ratios only (no PII).
export default async function HrActivityPage() {
  const user = await requireUser();

  // Server-side gate — defense in depth beyond the nav filter (which only hides
  // the link) and the permission check inside getHrDashboard.
  if (!can(user.role, "dashboard:read:company")) redirect("/");

  const caller = await resolveCaller(user);
  const t = await getTranslations("hrDashboard");
  const tStatus = await getTranslations("kbStatus");

  const now = new Date();
  const dashboard = await getHrDashboard(caller, now);
  const { docStatusCounts } = dashboard;
  const publishedPct =
    docStatusCounts.all > 0 ? Math.round((docStatusCounts.PUBLISHED / docStatusCounts.all) * 100) : 0;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        {/* KPI grid — value + trend sparkline + anomaly verdict */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.kpis.map((card) => {
            const Icon = KPI_ICON[card.key];
            return (
              <div key={card.key} className="card-elevated rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">{t(`kpi.${card.key}`)}</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="size-5" />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                  {card.value}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <AnomalyBadge anomaly={card.anomaly} namespace="hrDashboard" />
                  {card.series.length > 0 && (
                    <Sparkline values={card.series.map((p) => p.value)} width={88} height={28} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Document corpus — status breakdown, PUBLISHED share as the headline gauge */}
        <section className="card-elevated rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">{t("corpus.title")}</h2>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <Donut value={publishedPct} sublabel={t("corpus.publishedShare")} />
            <div className="flex-1 space-y-3">
              {DOC_STATUS_ORDER.map((status) => (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tStatus(status)}</span>
                    <span className="font-medium tabular-nums">{docStatusCounts[status]}</span>
                  </div>
                  <ProgressBar value={docStatusCounts[status]} max={Math.max(docStatusCounts.all, 1)} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
