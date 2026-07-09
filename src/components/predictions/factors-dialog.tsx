"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RiskBandBadge } from "./risk-band-badge";

// Explicability drawer. Shows each factor's CONTRIBUTION (points) with a bar
// tinted by that factor's own risk band — red for high-risk drivers, orange for
// moderate, emerald for low — never the raw sensitive value (the parent Server
// Component strips rawValue before this reaches the client).
export type FactorView = {
  key: string;
  label: string;
  points: number; // contribution to the 0–100 score
  normalized: number; // 0..1 intensity → bar width + colour
};

// Same 30/60 thresholds as the risk-map badge, applied to each factor's intensity.
function barColor(normalized: number): string {
  const pct = normalized * 100;
  if (pct > 60) return "bg-destructive";
  if (pct >= 30) return "bg-amber-500";
  return "bg-emerald-500";
}

export function FactorsDialog({
  employeeName,
  score,
  bandLabel,
  factors,
}: {
  employeeName: string;
  score: number;
  bandLabel: string;
  factors: FactorView[];
}) {
  const t = useTranslations("predictions.factors");
  const top = factors.filter((f) => f.points > 0).slice(0, 6);

  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="sm" className="text-xs" />}
      >
        <Info className="size-3.5" />
        {t("view")}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          {/* <div className="flex items-center justify-between gap-3"> */}
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>{t("sheetTitle", { name: employeeName })}</SheetTitle>
            <RiskBandBadge score={score} label={bandLabel} />
          </div>
          <SheetDescription>
            {t("description", { name: employeeName })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {top.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("none")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {top.map((f) => (
                <li
                  key={f.key}
                  className="space-y-2 rounded-lg bg-muted/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">
                      {f.label}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-muted-foreground">
                      {t("points", { points: Math.round(f.points) })}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        barColor(f.normalized),
                      )}
                      style={{
                        width: `${Math.max(4, Math.round(Math.min(1, f.normalized) * 100))}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
