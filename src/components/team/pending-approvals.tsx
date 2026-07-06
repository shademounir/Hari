"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { asLeaveType } from "@/lib/leave";
import {
  approveLeaveAction,
  bulkDecideAction,
  rejectLeaveAction,
} from "@/app/(dashboard)/team/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Serializable row shape (subset of LeaveRequestView) passed from the RSC page.
export type ApprovalRow = {
  id: string;
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
};

/**
 * Client island for the pending-approvals queue. Owns ONLY interaction state —
 * selection, dialog, and an optimistic copy of the list. All authorization +
 * scoping live in the server actions / lib/hr.ts; this component sends opaque ids
 * and a note. Approve/Reject (single or bulk) removes the affected rows
 * immediately via useOptimistic, then reconciles when the server revalidates:
 * on success the rows are gone for good; on failure the optimistic state reverts
 * (rows reappear) and an error toast fires.
 */
export function PendingApprovals({ rows }: { rows: ApprovalRow[] }) {
  const t = useTranslations("team");
  const tType = useTranslations("leaveType");
  const tc = useTranslations("common");

  const [isPending, startTransition] = useTransition();
  const [visible, removeOptimistic] = useOptimistic(rows, (state: ApprovalRow[], ids: string[]) =>
    state.filter((r) => !ids.includes(r.id)),
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Reject dialog is open when `rejectIds` is non-null (single row or a bulk set).
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);
  const [note, setNote] = useState("");

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)));

  const clearSelection = (ids: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

  // Single vs bulk are dispatched on the id count so each branch keeps a concrete
  // result type (BulkResult is a structural subtype of DecideResult, so a union of
  // the two would collapse and lose `count`).
  function runApprove(ids: string[]) {
    startTransition(async () => {
      removeOptimistic(ids);
      const { ok, count } =
        ids.length === 1
          ? { ok: (await approveLeaveAction(ids[0])).ok, count: 1 }
          : ((r) => ({ ok: r.ok, count: r.count }))(await bulkDecideAction(ids, "APPROVED"));
      if (ok) toast.success(t("toast.approved", { count }));
      else toast.error(t("toast.failed"));
      clearSelection(ids);
    });
  }

  function submitReject() {
    const ids = rejectIds;
    const reason = note.trim();
    if (!ids || !reason) return;
    setRejectIds(null);
    setNote("");
    startTransition(async () => {
      removeOptimistic(ids);
      const { ok, count } =
        ids.length === 1
          ? { ok: (await rejectLeaveAction(ids[0], reason)).ok, count: 1 }
          : ((r) => ({ ok: r.ok, count: r.count }))(await bulkDecideAction(ids, "REJECTED", reason));
      if (ok) toast.success(t("toast.rejected", { count }));
      else toast.error(t("toast.failed"));
      clearSelection(ids);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {t("pendingApprovals")}
          <Badge variant="secondary">{visible.length}</Badge>
        </h2>

        {/* Bulk action bar — appears once rows are selected. */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("selectedCount", { count: selected.size })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runApprove([...selected])}
            >
              <Check className="size-4" />
              {t("approveSelected")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setRejectIds([...selected])}
            >
              <X className="size-4" />
              {t("rejectSelected")}
            </Button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noPending")}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t("selectAll")}
                  />
                </TableHead>
                <TableHead>{t("employee")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead>{t("dates")}</TableHead>
                <TableHead>{t("days")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      aria-label={t("selectRow", { name: r.employeeName })}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                  <TableCell className="capitalize">{tType(asLeaveType(r.type))}</TableCell>
                  <TableCell className="tabular-nums">
                    {r.startDate} → {r.endDate}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.days}</TableCell>
                  <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                    {r.reason ?? tc("none")}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => runApprove([r.id])}
                      >
                        <Check className="size-4" />
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setRejectIds([r.id])}
                      >
                        <X className="size-4" />
                        {t("reject")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reject dialog — a non-empty reason is mandatory to submit. */}
      <Dialog open={rejectIds !== null} onOpenChange={(open) => !open && setRejectIds(null)}>
        <DialogContent className="p-6">
          <DialogTitle className="text-lg font-semibold">
            {rejectIds && rejectIds.length > 1
              ? t("rejectDialog.titleBulk", { count: rejectIds.length })
              : t("rejectDialog.title")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {t("rejectDialog.description")}
          </DialogDescription>
          <Textarea
            className="mt-4"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("rejectDialog.placeholder")}
            aria-label={t("rejectDialog.title")}
          />
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose
              render={
                <Button variant="ghost" onClick={() => setNote("")}>
                  {tc("cancel")}
                </Button>
              }
            />
            <Button variant="destructive" disabled={!note.trim() || isPending} onClick={submitReject}>
              {t("reject")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
