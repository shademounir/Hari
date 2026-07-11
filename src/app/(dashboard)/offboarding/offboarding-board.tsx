"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { OffboardingCategory, OffboardingReason } from "@prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OffboardingStepKey } from "@/lib/offboarding";
import { setOffboardingStepAction, completeOffboardingAction } from "./actions";

type Step = {
  id: string;
  key: OffboardingStepKey;
  category: OffboardingCategory;
  status: "PENDING" | "DONE";
};

export type BoardItem = {
  id: string;
  employeeName: string;
  title: string;
  reason: OffboardingReason;
  lastDay: string; // localized date string, formatted server-side
  steps: Step[];
  done: number;
  total: number;
  percent: number;
};

export function OffboardingBoard({ items }: { items: BoardItem[] }) {
  const t = useTranslations("offboarding");
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("noneInProgress")}
      </p>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <OffboardingCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function OffboardingCard({ item }: { item: BoardItem }) {
  const t = useTranslations("offboarding");
  const complete = item.done === item.total;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.employeeName}</p>
          <p className="text-xs text-muted-foreground">{item.title}</p>
        </div>
        <div className="text-right">
          <Badge variant="secondary">{t(`reasons.${item.reason}`)}</Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("lastDay")}: {item.lastDay}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("progress")}</span>
          <span className="tabular-nums">
            {t("progressCount", { done: item.done, total: item.total })}
          </span>
        </div>
        <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${item.percent}%` }}
          />
        </div>
      </div>

      <ul className="divide-y rounded-lg border">
        {item.steps.map((step) => (
          <StepRow key={step.id} step={step} label={t(`steps.${step.key}`)} />
        ))}
      </ul>

      <form action={completeOffboardingAction.bind(null, item.id)}>
        <Button type="submit" size="sm" disabled={!complete} className="w-full">
          {t("completeAndArchive")}
        </Button>
      </form>
    </div>
  );
}

function StepRow({ step, label }: { step: Step; label: string }) {
  const [pending, startTransition] = useTransition();
  const done = step.status === "DONE";
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Checkbox
        checked={done}
        disabled={pending}
        aria-label={label}
        onCheckedChange={(checked) =>
          startTransition(() => setOffboardingStepAction(step.id, checked === true))
        }
      />
      <span className={cn("flex-1 text-sm", done && "text-muted-foreground line-through")}>
        {label}
      </span>
    </li>
  );
}
