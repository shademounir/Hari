"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import type { AlertStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  acknowledgeAlertAction,
  resolveAlertAction,
  reopenAlertAction,
} from "@/app/(dashboard)/alerts/actions";

// Per-row triage menu for an alert. Collapses Acknowledge / Resolve / Reopen into
// one kebab so the table stays scannable and scales to a third action, matching
// the KB admin row-action pattern (components/kb/document-row-actions.tsx). The
// transition lives here, so pending is per-row; each action toasts on success.
export function AlertRowActions({ id, status }: { id: string; status: AlertStatus }) {
  const t = useTranslations("alerts");
  const [pending, start] = useTransition();

  const run = (action: (id: string) => Promise<void>, message: string) =>
    start(async () => {
      await action(id);
      toast.success(message);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t("rowActions")} />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {status === "OPEN" && (
          <DropdownMenuItem
            disabled={pending}
            onClick={() => run(acknowledgeAlertAction, t("toastAcknowledged"))}
          >
            {t("action.acknowledge")}
          </DropdownMenuItem>
        )}
        {status !== "RESOLVED" && (
          <DropdownMenuItem
            disabled={pending}
            onClick={() => run(resolveAlertAction, t("toastResolved"))}
          >
            {t("action.resolve")}
          </DropdownMenuItem>
        )}
        {status === "RESOLVED" && (
          <DropdownMenuItem
            disabled={pending}
            onClick={() => run(reopenAlertAction, t("toastReopened"))}
          >
            {t("action.reopen")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
