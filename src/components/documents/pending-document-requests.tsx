"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  rejectDocumentAction,
  validateDocumentAction,
} from "@/app/(dashboard)/documents/requests/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// Serializable row shape passed from the RSC page.
export type DocumentRequestRow = {
  id: string;
  employeeName: string;
  type: string;
  requestedAt: string;
};

/**
 * Client island for the pending document-requests queue (SCRUM-080). Mirrors
 * components/team/pending-approvals.tsx: owns only interaction state (dialog +
 * an optimistic copy of the list); authorization, scoping, and the SCRUM-081
 * PDF-generation trigger all live server-side in requests/actions.ts.
 */
export function PendingDocumentRequests({ rows }: { rows: DocumentRequestRow[] }) {
  const t = useTranslations("documents.requests");
  const tType = useTranslations("documents.type");
  const tc = useTranslations("common");

  const [isPending, startTransition] = useTransition();
  const [visible, removeOptimistic] = useOptimistic(rows, (state: DocumentRequestRow[], id: string) =>
    state.filter((r) => r.id !== id),
  );

  // Reject dialog is open when `rejectId` is non-null.
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function runApprove(id: string) {
    startTransition(async () => {
      removeOptimistic(id);
      const { ok, generated } = await validateDocumentAction(id);
      if (ok) toast.success(t(generated ? "toast.approved" : "toast.approvedPending"));
      else toast.error(t("toast.failed"));
    });
  }

  function submitReject() {
    const id = rejectId;
    const reason = note.trim();
    if (!id || !reason) return;
    setRejectId(null);
    setNote("");
    startTransition(async () => {
      removeOptimistic(id);
      const { ok } = await rejectDocumentAction(id, reason);
      if (ok) toast.success(t("toast.rejected"));
      else toast.error(t("toast.failed"));
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {t("title")}
        <Badge variant="secondary">{visible.length}</Badge>
      </h2>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noPending")}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("employee")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead>{t("requestedOn")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                  <TableCell>{tType(r.type as "WORK_CERTIFICATE")}</TableCell>
                  <TableCell className="tabular-nums">{r.requestedAt}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => runApprove(r.id)}
                      >
                        <Check className="size-4" />
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setRejectId(r.id)}
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
      <Dialog open={rejectId !== null} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent className="p-6">
          <DialogTitle className="text-lg font-semibold">{t("rejectDialog.title")}</DialogTitle>
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
            <Button
              variant="destructive"
              disabled={!note.trim() || isPending}
              onClick={submitReject}
            >
              {t("reject")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
