"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SlidersHorizontal, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DEFAULT_WEIGHTS, type RiskFactorKey, type RiskWeights } from "@/lib/predictive/departure-risk";
import { saveWeightConfigAction } from "@/app/(dashboard)/analytics/predictions/actions";

const FACTOR_KEYS = Object.keys(DEFAULT_WEIGHTS) as RiskFactorKey[];

// Weights (fractions) → integer percentages that sum to 100. Rounds, then fixes
// the largest bucket so the displayed total is always exactly 100.
function toPercents(weights: RiskWeights): Record<RiskFactorKey, number> {
  const pct = {} as Record<RiskFactorKey, number>;
  for (const k of FACTOR_KEYS) pct[k] = Math.round((weights[k] ?? 0) * 100);
  const drift = 100 - FACTOR_KEYS.reduce((s, k) => s + pct[k], 0);
  if (drift !== 0) {
    const biggest = FACTOR_KEYS.reduce((a, b) => (pct[b] > pct[a] ? b : a));
    pct[biggest] += drift;
  }
  return pct;
}

export function RecalibrationDialog({ weights }: { weights: RiskWeights }) {
  const t = useTranslations("predictions.recalibrate");
  const tFactor = useTranslations("predictions.factor");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState<Record<RiskFactorKey, number>>(() => toPercents(weights));
  const [pending, startTransition] = useTransition();

  const total = FACTOR_KEYS.reduce((s, k) => s + pct[k], 0);
  const valid = total === 100;

  function setOne(key: RiskFactorKey, value: number) {
    setPct((prev) => ({ ...prev, [key]: value }));
  }

  function normalize() {
    // Proportionally scale to 100, then absorb rounding drift into the largest.
    if (total === 0) return;
    const scaled = {} as Record<RiskFactorKey, number>;
    for (const k of FACTOR_KEYS) scaled[k] = Math.round((pct[k] / total) * 100);
    const drift = 100 - FACTOR_KEYS.reduce((s, k) => s + scaled[k], 0);
    if (drift !== 0) {
      const biggest = FACTOR_KEYS.reduce((a, b) => (scaled[b] > scaled[a] ? b : a));
      scaled[biggest] += drift;
    }
    setPct(scaled);
  }

  function onSave() {
    if (!valid || pending) return;
    const next = {} as RiskWeights;
    for (const k of FACTOR_KEYS) next[k] = pct[k] / 100;
    startTransition(async () => {
      const res = await saveWeightConfigAction(next);
      if (res.ok) {
        toast.success(t("saved"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(t("errorTitle"), { description: t(`error.${res.error}`) });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setPct(toPercents(weights)); // reset from server state each open
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <SlidersHorizontal className="size-4" />
        {t("button")}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" />}>
          <X className="size-4" />
          <span className="sr-only">{t("cancel")}</span>
        </DialogClose>

        <div className="border-b p-4 pr-10">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          {FACTOR_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{tFactor(key)}</span>
                <span className="tabular-nums text-muted-foreground">{pct[key]}%</span>
              </div>
              <Slider
                value={pct[key]}
                min={0}
                max={100}
                step={1}
                disabled={pending}
                onValueChange={(v) => setOne(key, Array.isArray(v) ? v[0] : (v as number))}
                aria-label={tFactor(key)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("total")}</span>
            <Badge
              className={cn(
                "border-transparent tabular-nums",
                valid
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              )}
            >
              {total}%
            </Badge>
            {!valid && <span className="text-xs text-amber-600 dark:text-amber-400">{t("mustSum")}</span>}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={normalize} disabled={pending || total === 0}>
              {t("normalize")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onSave} disabled={!valid || pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
