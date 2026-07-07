import { getTranslations } from "next-intl/server";
import { ArrowRight, TriangleAlert, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskBand } from "@/lib/predictive/departure-risk";
import type { SuccessionEntry } from "@/lib/predictive/dashboard";

// Model band → badge styling (independent of the risk-map's 30/60 display bands).
const BAND_STYLE: Record<RiskBand, string> = {
  LOW: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  HIGH: "bg-destructive/10 text-destructive",
};

// Server Component. One card per people-manager: the suggested internal successor,
// or an alert badge when no obvious backup exists. No salary — tenure + title only.
export async function SuccessionList({ entries }: { entries: SuccessionEntry[] }) {
  const t = await getTranslations("predictions.succession");
  const tBand = await getTranslations("predictions.band");

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
      {entries.map((e) => (
        <li key={e.incumbentId} className="flex min-w-0 flex-col rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground" title={e.roleTitle}>
                {e.roleTitle}
              </p>
              <p className="truncate text-xs text-muted-foreground" title={`${e.incumbentName} · ${e.department}`}>
                {e.incumbentName} · {e.department}
              </p>
            </div>
            {e.successor ? (
              <Badge className="shrink-0 gap-1 border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
                <UserCheck className="size-3" />
                {t("covered")}
              </Badge>
            ) : (
              <Badge className="shrink-0 gap-1 border-transparent bg-destructive/10 text-destructive">
                <TriangleAlert className="size-3" />
                {t("gap")}
              </Badge>
            )}
          </div>

          <div className="mt-3 border-t pt-3">
            {e.successor ? (
              <div className="flex items-center gap-2 text-sm">
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground" title={e.successor.name}>
                    {e.successor.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.successor.title} · {t("tenure", { years: (e.successor.tenureMonths / 12).toFixed(1) })}
                  </p>
                </div>
                <Badge className={cn("shrink-0 border-transparent font-semibold", BAND_STYLE[e.successor.band])}>
                  {tBand(e.successor.band === "HIGH" ? "red" : e.successor.band === "MEDIUM" ? "orange" : "green")}
                </Badge>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{t("noSuccessor")}</span>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
