import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Map as MapIcon, TrendingDown, FlaskConical, Network, Target, Users, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getRiskMap, getSuccessionPlan, getDepartments, getModelAccuracy } from "@/lib/predictive/dashboard";
import { getActiveModelConfig } from "@/lib/predictive/data-layer";
import type { RiskBand } from "@/lib/predictive/departure-risk";
import { PageHeader } from "@/components/layout/page-header";
import { RiskMap } from "@/components/predictions/risk-map";
import { displayBand } from "@/components/predictions/risk-band-badge";
import { RiskMapFilters } from "@/components/predictions/risk-map-filters";
import { RiskMapPagination } from "@/components/predictions/risk-map-pagination";
import { DepartureAnalytics } from "@/components/predictions/departure-analytics";
import { RecruitmentSimulator } from "@/components/predictions/recruitment-simulator";
import { SuccessionList } from "@/components/predictions/succession-list";
import { RecalibrationDialog } from "@/components/predictions/recalibration-dialog";

const PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ dept?: string; band?: string; page?: string }>;
};

// RSC-first: all reads happen here through the role-scoped predictive data layer.
// Table filtering + pagination live in the URL (searchParams) so the view is
// bookmarkable and the table stays server-rendered; only the chart filter and the
// What-if simulator are Client Components. STRICTLY gated to HR/Admin —
// `dashboard:read:company` is held by exactly HR_ADMIN + SUPER_ADMIN.
export default async function PredictionsPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!can(user.role, "predictions:read") || !can(user.role, "dashboard:read:company")) {
    redirect("/");
  }

  const params = await searchParams;
  const t = await getTranslations("predictions");

  const now = new Date();
  const risk = await getRiskMap(now);
  const scoreByEmployee = new Map<string, { score: number; band: RiskBand }>(
    risk.rows.map((r) => [r.employeeId, { score: r.score, band: r.band }]),
  );

  const [succession, departments, accuracy, config] = await Promise.all([
    getSuccessionPlan(scoreByEmployee, now),
    getDepartments(),
    getModelAccuracy(),
    getActiveModelConfig(),
  ]);

  const canRecalibrate = can(user.role, "predictions:manage");
  const highRiskCount = risk.rows.filter((r) => displayBand(r.score) === "red").length;

  // ── Risk-map filtering + pagination (URL-driven) ──────────────────────
  const dept = params.dept && departments.includes(params.dept) ? params.dept : undefined;
  const band =
    params.band === "red" || params.band === "orange" || params.band === "green"
      ? params.band
      : undefined;

  let filtered = risk.rows;
  if (dept) filtered = filtered.filter((r) => r.department === dept);
  if (band) filtered = filtered.filter((r) => displayBand(r.score) === band);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Charts use the full active population (independent of table paging).
  const chartRows = risk.rows.map((r) => ({ department: r.department, score: r.score }));

  const tm = await getTranslations("predictions.metrics");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")}>
        {canRecalibrate && <RecalibrationDialog weights={config.weights} />}
      </PageHeader>

      <div className="space-y-6 p-4 md:p-8">
        {/* Top metrics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            icon={Target}
            label={tm("accuracy")}
            value={accuracy ? `${accuracy.accuracyPct}%` : "—"}
            hint={accuracy ? tm("accuracyHint", { n: accuracy.departed }) : tm("noData")}
            accent="emerald"
          />
          <MetricCard icon={Users} label={tm("evaluated")} value={String(risk.rows.length)} hint={tm("evaluatedHint")} />
          <MetricCard
            icon={ShieldAlert}
            label={tm("highRisk")}
            value={String(highRiskCount)}
            hint={tm("highRiskHint")}
            accent="red"
          />
        </div>

        <Section icon={MapIcon} title={t("riskMap.title")} description={t("riskMap.description")}>
          {risk.source === "live" && risk.rows.length > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">{t("riskMap.liveNote")}</p>
          )}
          <RiskMapFilters departments={departments} />
          <RiskMap rows={pageRows} />
          <RiskMapPagination
            page={page}
            pageCount={pageCount}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            params={{ dept, band }}
          />
        </Section>

        <Section icon={TrendingDown} title={t("projection.title")} description={t("projection.description")}>
          <DepartureAnalytics
            rows={chartRows}
            departments={departments}
            activeCount={risk.activeCount}
            asOf={now.toISOString()}
          />
        </Section>

        <Section icon={FlaskConical} title={t("simulator.title")} description={t("simulator.description")}>
          <RecruitmentSimulator departments={departments} />
        </Section>

        <Section icon={Network} title={t("succession.title")} description={t("succession.description")}>
          <SuccessionList entries={succession} />
        </Section>
      </div>
    </>
  );
}

const METRIC_ACCENT = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  red: "bg-destructive/10 text-destructive",
} as const;

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent?: keyof typeof METRIC_ACCENT;
}) {
  return (
    <div className="card-elevated rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`rounded-lg p-2 ${METRIC_ACCENT[accent]}`}>
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-elevated rounded-2xl border bg-card p-5 md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
