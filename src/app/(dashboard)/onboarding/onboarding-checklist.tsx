"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { OnboardingCategory } from "@prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OnboardingStepKey } from "@/lib/onboarding";
import { setOnboardingStatusAction } from "./actions";

type Task = {
  id: string;
  key: OnboardingStepKey;
  category: OnboardingCategory;
  status: "PENDING" | "DONE";
};

// SCRUM-095 — the collaborator's own checklist. Ticking a step optimistically
// disables it during the server round-trip; ownership is re-checked server-side.
export function OnboardingChecklist({ tasks }: { tasks: Task[] }) {
  const t = useTranslations("onboarding");

  // Preserve template order, but group by category for a scannable layout.
  const byCategory = new Map<OnboardingCategory, Task[]>();
  for (const task of tasks) {
    const list = byCategory.get(task.category) ?? [];
    list.push(task);
    byCategory.set(task.category, list);
  }

  return (
    <div className="space-y-6">
      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`categories.${category}`)}
          </h3>
          <ul className="divide-y rounded-lg border">
            {items.map((task) => (
              <OnboardingRow key={task.id} task={task} label={t(`steps.${task.key}`)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function OnboardingRow({ task, label }: { task: Task; label: string }) {
  const t = useTranslations("onboarding");
  const [pending, startTransition] = useTransition();
  const done = task.status === "DONE";

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Checkbox
        checked={done}
        disabled={pending}
        aria-label={label}
        onCheckedChange={(checked) =>
          startTransition(() => setOnboardingStatusAction(task.id, checked === true))
        }
      />
      <span
        className={cn(
          "flex-1 text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {label}
      </span>
      {done && (
        <Badge variant="secondary" className="text-xs">
          {t("stepDone")}
        </Badge>
      )}
    </li>
  );
}
