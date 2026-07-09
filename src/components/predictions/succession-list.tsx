import { getTranslations } from "next-intl/server";
import { PlaneTakeoff, TriangleAlert, Users, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskBand } from "@/lib/predictive/departure-risk";
import type { ReadinessLevel, SuccessionEntry, SuccessionSuccessor } from "@/lib/predictive/dashboard";
import { TransitionPlanButton } from "./transition-plan-button";

// Model band → badge styling (independent of the risk-map's 30/60 display bands).
const BAND_STYLE: Record<RiskBand, string> = {
  LOW: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  HIGH: "bg-destructive/10 text-destructive",
};

const bandKey = (b: RiskBand): "red" | "orange" | "green" =>
  b === "HIGH" ? "red" : b === "MEDIUM" ? "orange" : "green";

// Readiness → bar colour.
const READINESS_STYLE: Record<ReadinessLevel, string> = {
  READY_NOW: "bg-emerald-500",
  READY_1_2Y: "bg-amber-500",
  DEVELOPING: "bg-slate-400 dark:bg-slate-500",
};

// Server Component. One card per people-manager showing bench strength (top
// successors with readiness) and flagging a flight-risk incumbent — hard-styled
// when a HIGH-risk manager has no viable bench. No salary — tenure + readiness only.
export async function SuccessionList({ entries }: { entries: SuccessionEntry[] }) {
  const t = await getTranslations("predictions.succession");
  const tBand = await getTranslations("predictions.band");
  const tReady = await getTranslations("predictions.readiness");

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
        <Users className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">{t("empty")}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {entries.map((e) => {
        const flightRisk = e.incumbentRiskBand === "HIGH";
        const hasBench = e.successors.length > 0;
        const critical = flightRisk && !hasBench; // worst case: manager may leave, no cover

        return (
          <li
            key={e.incumbentId}
            className={cn(
              "flex min-w-0 flex-col rounded-xl border bg-card p-4",
              critical && "border-destructive/40 bg-destructive/5",
            )}
          >
            {/* Incumbent header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground" title={e.roleTitle}>
                  {e.roleTitle}
                </p>
                <div className="flex min-w-0 items-center gap-1.5">
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={`${e.incumbentName} · ${e.department}`}
                  >
                    {e.incumbentName} · {e.department}
                  </p>
                  {flightRisk && (
                    <Badge className="shrink-0 gap-1 border-transparent bg-destructive/10 text-destructive">
                      <PlaneTakeoff className="size-3" />
                      {t("flightRisk")}
                    </Badge>
                  )}
                </div>
              </div>
              {hasBench ? (
                <Badge className="shrink-0 gap-1 border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
                  <UserCheck className="size-3" />
                  {t("benchCount", { count: e.successors.length })}
                </Badge>
              ) : (
                <Badge className="shrink-0 gap-1 border-transparent bg-destructive/10 text-destructive">
                  <TriangleAlert className="size-3" />
                  {t("gap")}
                </Badge>
              )}
            </div>

            {/* Bench */}
            <div className="mt-3 border-t pt-3">
              {hasBench ? (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("bench")}
                  </p>
                  <ul className="space-y-1.5">
                    {e.successors.map((s, i) => (
                      <SuccessorRow
                        key={i}
                        successor={s}
                        tenureLabel={t("tenure", { years: (s.tenureMonths / 12).toFixed(1) })}
                        readinessLabel={tReady(s.readinessLevel)}
                        bandLabel={tBand(bandKey(s.band))}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg p-2.5 text-sm",
                    critical
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{critical ? t("criticalGap") : t("noSuccessor")}</span>
                </div>
              )}
            </div>

            {/* AI transition plan */}
            <div className="mt-3 flex justify-end">
              <TransitionPlanButton
                incumbentTitle={e.roleTitle}
                incumbentRisk={e.incumbentRiskBand}
                successors={e.successors}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SuccessorRow({
  successor: s,
  tenureLabel,
  readinessLabel,
  bandLabel,
}: {
  successor: SuccessionSuccessor;
  tenureLabel: string;
  readinessLabel: string;
  bandLabel: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground" title={s.name}>
            {s.name}
          </p>
          <Badge className={cn("shrink-0 border-transparent text-[10px]", BAND_STYLE[s.band])}>{bandLabel}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {s.title} · {tenureLabel}
        </p>
      </div>

      {/* Readiness indicator */}
      <div className="w-24 shrink-0">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">{readinessLabel}</span>
          <span className="tabular-nums">{s.readinessScore}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-background">
          <div
            className={cn("h-full rounded-full", READINESS_STYLE[s.readinessLevel])}
            style={{ width: `${Math.max(4, s.readinessScore)}%` }}
          />
        </div>
      </div>
    </li>
  );
}
