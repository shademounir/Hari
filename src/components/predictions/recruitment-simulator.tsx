"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  HelpCircle,
  Clock,
  Wallet,
  TriangleAlert,
  Lightbulb,
  CheckCircle2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  simulateRecruitmentAction,
  type RecruitmentPlan,
} from "@/app/(dashboard)/analytics/predictions/actions";
import {
  SENIORITY_LEVELS,
  URGENCY_LEVELS,
  type Seniority,
  type Urgency,
} from "@/app/(dashboard)/analytics/predictions/simulator-constants";

// Client island: collects an advanced scenario (department, seniority, count,
// budget, urgency) and calls the Server Action (which runs the AI SDK). All
// authorization + the model call live server-side. Any failure (incl. an upstream
// 429 rate limit) surfaces as a destructive toast — never a silent hang.
export function RecruitmentSimulator({
  departments,
}: {
  departments: string[];
}) {
  const t = useTranslations("predictions.simulator");
  const [department, setDepartment] = useState<string>(departments[0] ?? "");
  const [seniority, setSeniority] = useState<Seniority>("MID");
  const [count, setCount] = useState<number>(1);
  const [budget, setBudget] = useState<number>(500000);
  const [urgency, setUrgency] = useState<Urgency>("NORMAL");
  const [plan, setPlan] = useState<RecruitmentPlan | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!department || pending) return;
    setPlan(null);
    startTransition(async () => {
      const res = await simulateRecruitmentAction({
        department,
        count,
        seniority,
        budget,
        urgency,
      });
      if (res.ok) {
        setPlan(res.plan);
      } else {
        toast.error(t("aiErrorTitle"), {
          description: t(`error.${res.error}`),
        });
      }
    });
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <form onSubmit={onSubmit}>
          <fieldset
            disabled={pending}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field label={t("department")} htmlFor="sim-department" help={t("help")}>
              <Select
                value={department}
                onValueChange={(v) => v && setDepartment(v)}
                disabled={pending}
              >
                <SelectTrigger id="sim-department" className="w-full">
                  <SelectValue placeholder={t("departmentPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("seniorityLevel")} htmlFor="sim-seniority">
              <Select
                value={seniority}
                onValueChange={(v) => v && setSeniority(v as Seniority)}
                disabled={pending}
              >
                <SelectTrigger id="sim-seniority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENIORITY_LEVELS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`seniority.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("urgency")} htmlFor="sim-urgency">
              <Select
                value={urgency}
                onValueChange={(v) => v && setUrgency(v as Urgency)}
                disabled={pending}
              >
                <SelectTrigger id="sim-urgency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {URGENCY_LEVELS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`urgencyLevel.${u}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("count")} htmlFor="sim-count">
              <Input
                id="sim-count"
                type="number"
                min={1}
                max={50}
                value={count}
                disabled={pending}
                onChange={(e) =>
                  setCount(
                    Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                  )
                }
              />
            </Field>

            <Field label={t("budget")} htmlFor="sim-budget" help={t("budgetHelp")}>
              <Input
                id="sim-budget"
                type="number"
                min={0}
                step={10000}
                value={budget}
                disabled={pending}
                placeholder={t("budgetPlaceholder")}
                onChange={(e) =>
                  setBudget(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </Field>

            <div className="flex items-end">
              <Button
                type="submit"
                disabled={pending || !department}
                className="w-full gap-1.5"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {t("submit")}
              </Button>
            </div>
          </fieldset>
        </form>

        {/* Announce the async AI outcome to assistive tech: a busy cue while the
            model runs, then the plan itself once it resolves (WCAG 4.1.3). */}
        <div role="status" aria-live="polite" aria-busy={pending}>
          {pending && <span className="sr-only">{t("generating")}</span>}
          {plan && <PlanView plan={plan} />}
        </div>
      </div>
    </TooltipProvider>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        {help && <HelpTooltip text={help} />}
      </div>
      {children}
    </div>
  );
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={text}
            className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          />
        }
      >
        <HelpCircle className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function PlanView({ plan }: { plan: RecruitmentPlan }) {
  const t = useTranslations("predictions.simulator");
  const cost = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: plan.estimatedCost.currency,
    maximumFractionDigits: 0,
  }).format(plan.estimatedCost.amount);

  return (
    <div className="printable space-y-4 rounded-xl border bg-muted/30 p-4">
      <div className="print-hidden flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("planTitle")}
        </span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Download className="size-4" />
          {t("downloadPdf")}
        </Button>
      </div>

      <p className="text-sm text-foreground">{plan.summary}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          icon={Clock}
          label={t("timeToHire")}
          value={t("weeks", { weeks: plan.estimatedTimeToHireWeeks })}
        />
        <Stat icon={Wallet} label={t("estimatedCost")} value={cost} />
      </div>

      {/* Budget assessment — how the plan fits the stated budget. */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border p-3 text-sm",
          plan.fitsBudget
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5",
        )}
      >
        {plan.fitsBudget ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <div>
          <p className="font-medium text-foreground">
            {plan.fitsBudget ? t("withinBudget") : t("overBudget")}
          </p>
          <p className="text-muted-foreground">{plan.budgetAssessment}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("profiles")}
        </p>
        <ul className="space-y-2">
          {plan.profiles.map((p, i) => (
            <li key={i} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {p.count}× {p.title}
                </span>
                <Badge variant="secondary">
                  {t(`seniority.${p.seniority}`)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.rationale}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {plan.risks.length > 0 && (
        <ListBlock icon={TriangleAlert} title={t("risks")} items={plan.risks} />
      )}
      {plan.recommendations.length > 0 && (
        <ListBlock
          icon={Lightbulb}
          title={t("recommendations")}
          items={plan.recommendations}
        />
      )}

      {plan.estimatedCost.notes && (
        <p className="text-xs text-muted-foreground">
          {plan.estimatedCost.notes}
        </p>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-semibold tabular-nums text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

function ListBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
