"use client";

import { useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Loader2, FileCheck2, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import {
  generateDocumentAction,
  rejectDocumentAction,
} from "@/app/(dashboard)/documents/actions";
import type { GeneratedDocumentStatus } from "@prisma/client";

export type QueueRow = {
  id: string;
  status: GeneratedDocumentStatus;
  requestedAt: string; // ISO
  generatedAt: string | null; // ISO
  requesterName: string | null;
  department: string | null;
  pdfUrl: string | null;
};

// HR fulfillment queue (client island): Generate produces the real PDF via the
// Server Action; Reject captures a note. All authorization is re-checked server-side.
export function DocumentQueue({ rows }: { rows: QueueRow[] }) {
  const t = useTranslations("documents");
  const format = useFormatter();
  const [pendingId, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<QueueRow | null>(null);
  const [note, setNote] = useState("");

  function onGenerate(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await generateDocumentAction(id);
      if (res.ok) toast.success(t("queue.generated"));
      else toast.error(t("queue.actionError"), { description: t(`queue.reason.${res.reason}` as Parameters<typeof t>[0]) });
      setBusyId(null);
    });
  }

  function onReject() {
    const target = rejecting;
    if (!target) return;
    setBusyId(target.id);
    startTransition(async () => {
      const res = await rejectDocumentAction(target.id, note.trim());
      if (res.ok) toast.success(t("queue.rejected"));
      else toast.error(t("queue.actionError"), { description: t(`queue.reason.${res.reason}` as Parameters<typeof t>[0]) });
      setBusyId(null);
      setRejecting(null);
      setNote("");
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {t("queue.empty")}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {rows.map((row) => {
          const actionable = row.status === "REQUESTED" || row.status === "VALIDATED";
          const isBusy = busyId === row.id && pendingId;
          return (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {row.requesterName ?? "—"}
                  {row.department && (
                    <span className="text-muted-foreground"> · {row.department}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("workCertificateTitle")} ·{" "}
                  {format.dateTime(new Date(row.requestedAt), { dateStyle: "medium" })}
                  {row.generatedAt && (
                    <>
                      {" · "}
                      {t("generatedOn", {
                        date: format.dateTime(new Date(row.generatedAt), { dateStyle: "medium" }),
                      })}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DocumentStatusBadge status={row.status} />
                {actionable && (
                  <>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={!!isBusy}
                      onClick={() => onGenerate(row.id)}
                    >
                      {isBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileCheck2 className="size-4" />
                      )}
                      {t("queue.generate")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={!!isBusy}
                      onClick={() => {
                        setRejecting(row);
                        setNote("");
                      }}
                    >
                      <X className="size-4" />
                      {t("queue.reject")}
                    </Button>
                  </>
                )}
                {row.pdfUrl && (
                  <ButtonLink
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    href={`/api/documents/${row.id}/download`}
                  >
                    <Download className="size-4" />
                    {t("download")}
                  </ButtonLink>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <div className="space-y-1.5">
            <DialogTitle>{t("queue.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("queue.rejectDescription")}</DialogDescription>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("queue.rejectPlaceholder")}
            rows={3}
            maxLength={500}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>
              {t("queue.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!note.trim() || !!busyId}
              onClick={onReject}
            >
              {t("queue.confirmReject")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
