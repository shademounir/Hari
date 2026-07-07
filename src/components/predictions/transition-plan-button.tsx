"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles, Loader2, X, UserCheck, Clock, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateTransitionPlan,
  type TransitionPlan,
} from "@/app/(dashboard)/analytics/predictions/actions";
import type { RiskBand } from "@/lib/predictive/departure-risk";
import type { SuccessionSuccessor } from "@/lib/predictive/dashboard";

// Calls the real AI transition-planning action. Shows a spinner + disables while
// generating, surfaces failures (incl. an upstream 429) as a destructive toast,
// and renders the returned plan in a premium Dialog on success.
export function TransitionPlanButton({
  incumbentTitle,
  incumbentRisk,
  successors,
}: {
  incumbentTitle: string;
  incumbentRisk: RiskBand;
  successors: SuccessionSuccessor[];
}) {
  const t = useTranslations("predictions.succession");
  const [pending, startTransition] = useTransition();
  const [plan, setPlan] = useState<TransitionPlan | null>(null);
  const [open, setOpen] = useState(false);

  function run() {
    if (pending) return;
    startTransition(async () => {
      const res = await generateTransitionPlan({
        incumbentTitle,
        incumbentRisk,
        successors: successors.map((s) => ({
          name: s.name,
          title: s.title,
          readinessLevel: s.readinessLevel,
          readinessScore: s.readinessScore,
        })),
      });
      if (res.ok) {
        setPlan(res.plan);
        setOpen(true);
      } else {
        toast.error(t("transition.errorTitle"), { description: t(`transition.error.${res.error}`) });
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={run}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {t("transitionPlan")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" />}
          >
            <X className="size-4" />
            <span className="sr-only">{t("transition.close")}</span>
          </DialogClose>

          <div className="border-b p-4 pr-10">
            <DialogTitle>{t("transition.title", { role: incumbentTitle })}</DialogTitle>
            <DialogDescription>{t("transition.subtitle")}</DialogDescription>
          </div>

          {plan && (
            <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
              {/* Recommendation + timeline */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="rounded-lg bg-emerald-500/12 p-1.5 text-emerald-600 dark:text-emerald-400">
                    <UserCheck className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("transition.recommended")}</p>
                    <p className="truncate font-semibold text-foreground">{plan.recommendedSuccessor}</p>
                  </div>
                </div>
                <Badge className="gap-1 border-transparent bg-primary/10 text-primary">
                  <Clock className="size-3" />
                  {plan.timeline}
                </Badge>
              </div>

              {/* Knowledge transfer — checklist style */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("transition.knowledgeTransfer")}
                </h4>
                <ul className="space-y-1.5">
                  {plan.knowledgeTransferChecklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 rounded-lg bg-muted/40 p-2.5 text-sm">
                      <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Skill gaps — warning colours */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("transition.skillGaps")}
                </h4>
                <ul className="space-y-1.5">
                  {plan.skillGapsToAddress.map((gap, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-sm"
                    >
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="text-foreground">{gap}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
