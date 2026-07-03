"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveLeaveAction, rejectLeaveAction } from "@/app/(dashboard)/team/actions";

/**
 * Approve/Reject controls for a single pending request. The client holds ONLY the
 * opaque request id — never a role, employeeId, or scope. Both handlers call
 * server actions that re-derive the caller from the session and mutate through
 * the scoped decideLeaveRequest, so a forged id from the client simply matches
 * zero rows server-side. useTransition keeps the row responsive during the action.
 */
export function ApprovalActions({ requestId }: { requestId: string }) {
  const t = useTranslations("team");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => approveLeaveAction(requestId))}
      >
        <Check className="size-4" />
        {t("approve")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => rejectLeaveAction(requestId))}
      >
        <X className="size-4" />
        {t("reject")}
      </Button>
    </div>
  );
}
