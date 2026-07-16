import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, Users, Info } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  getPredictionCandidates,
  scoreCandidates,
  getActiveModelConfig,
} from "@/lib/predictive/data-layer";
import { PageHeader } from "@/components/layout/page-header";
import { RiskBandBadge, displayBand } from "@/components/predictions/risk-band-badge";

// Manager-scoped departure-risk view. `predictions:read` is held by MANAGER but the
// full board (/analytics/predictions) additionally requires dashboard:read:company,
// so managers previously had the permission with no UI. This surfaces it, scoped to
// their own reports via getPredictionCandidates(caller) and ANONYMIZED (no names/
// titles/ids) to match the permission's contract and the chatbot tool's behavior.
// HR/Admins are sent to the full company board instead.
export default async function TeamPredictionsPage() {
  const user = await requireUser();
  if (!can(user, "predictions:read")) redirect("/");
  if (can(user, "dashboard:read:company")) redirect("/analytics/predictions");

  const t = await getTranslations("predictions.team");
  const tb = await getTranslations("predictions.band");
  const tf = await getTranslations("predictions.factor");

  const now = new Date();
  const candidates = await getPredictionCandidates(user);
  const config = await getActiveModelConfig();
  const scored = candidates.length ? await scoreCandidates(candidates, { asOf: now, config }) : [];
  const highRisk = scored.filter((s) => displayBand(s.score) === "red").length;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{t("anonymizedNote")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Metric icon={Users} label={t("evaluated")} value={String(scored.length)} />
          <Metric icon={ShieldAlert} label={t("highRisk")} value={String(highRisk)} accent />
        </div>

        {scored.length === 0 ? (
          <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {scored.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t("rank", { n: i + 1 })}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.department, ...s.factors.slice(0, 2).map((f) => tf(f.key))].join(" · ")}
                  </p>
                </div>
                <RiskBandBadge score={s.score} label={tb(displayBand(s.score))} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card-elevated rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div
          className={`rounded-lg p-2 ${accent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
        >
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
