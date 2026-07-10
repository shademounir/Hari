"use client";

import { useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { FileText, Download, Check, X } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requestDocumentAction, validateDocumentAction, rejectDocumentAction } from "./actions";
import type { GeneratedDocumentType, GeneratedDocumentStatus } from "@prisma/client";

export type DocumentRow = {
  id: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  requesterName: string | null;
  subjectName: string | null;
  createdAt: string;
  generatedAt: string | null;
  rejectionNote: string | null;
};

export type LeaveOption = { id: string; type: string; startDate: string; endDate: string };
export type TeamOption = { userId: string; name: string };

const STATUS_VARIANT: Record<GeneratedDocumentStatus, "secondary" | "default" | "destructive" | "outline"> = {
  REQUESTED: "secondary",
  VALIDATED: "secondary",
  GENERATED: "default",
  DOWNLOADED: "outline",
  REJECTED: "destructive",
};

function StatusBadge({ status }: { status: GeneratedDocumentStatus }) {
  const t = useTranslations("documents");
  return <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}

function TypeLabel({ type }: { type: GeneratedDocumentType }) {
  const t = useTranslations("documents");
  return <>{t(`type.${type}`)}</>;
}

export function DocumentsView({
  canRequest,
  canRequestTeam,
  canValidate,
  documents,
  pending,
  approvedLeaves,
  teamOptions,
}: {
  canRequest: boolean;
  canRequestTeam: boolean;
  canValidate: boolean;
  documents: DocumentRow[];
  pending: DocumentRow[];
  approvedLeaves: LeaveOption[];
  teamOptions: TeamOption[];
}) {
  const t = useTranslations("documents");
  const format = useFormatter();

  const fmt = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
        {canValidate && (
          <TabsTrigger value="review">
            {t("tabs.review")}
            {pending.length > 0 && (
              <Badge variant="destructive" className="ml-1.5">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="mine" className="space-y-6 pt-4">
        {(canRequest || canRequestTeam) && (
          <div className="grid gap-4 md:grid-cols-2">
            {canRequest && (
              <RequestCard
                titleKey="workCertificateTitle"
                descriptionKey="workCertificateDescription"
                actionLabel={t("requestWorkCertificate")}
              >
                <input type="hidden" name="type" value="WORK_CERTIFICATE" />
              </RequestCard>
            )}

            {canRequest && (
              <RequestCard
                titleKey="leaveConfirmationTitle"
                descriptionKey="leaveConfirmationDescription"
                actionLabel={t("requestLeaveConfirmation")}
                disabled={approvedLeaves.length === 0}
                disabledHint={t("noApprovedLeaves")}
              >
                <input type="hidden" name="type" value="LEAVE_CONFIRMATION" />
                <Select name="leaveRequestId">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("selectLeave")} />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedLeaves.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.type} · {fmt(l.startDate)} → {fmt(l.endDate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </RequestCard>
            )}

            {canRequest && (
              <RequestCard
                titleKey="recommendationLetterTitle"
                descriptionKey="recommendationLetterDescription"
                actionLabel={t("requestRecommendationLetter")}
              >
                <input type="hidden" name="type" value="RECOMMENDATION_LETTER" />
              </RequestCard>
            )}

            {canRequest && (
              <RequestCard
                titleKey="hrSummaryTitle"
                descriptionKey="hrSummaryDescription"
                actionLabel={t("requestHrSummary")}
              >
                <input type="hidden" name="type" value="HR_SUMMARY" />
              </RequestCard>
            )}

            {canRequestTeam && (
              <RequestCard
                titleKey="mutationLetterTitle"
                descriptionKey="mutationLetterDescription"
                actionLabel={t("requestMutationLetter")}
                disabled={teamOptions.length === 0}
                disabledHint={t("noTeamMembers")}
              >
                <input type="hidden" name="type" value="MUTATION_LETTER" />
                <Select name="targetUserId">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("selectTeamMember")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamOptions.map((o) => (
                      <SelectItem key={o.userId} value={o.userId}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </RequestCard>
            )}
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t("history")}</h3>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDocuments")}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("colType")}</th>
                    <th className="px-3 py-2 font-medium">{t("colSubject")}</th>
                    <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
                    <th className="px-3 py-2 font-medium">{t("colDate")}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2">
                        <TypeLabel type={d.type} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {d.subjectName ?? d.requesterName ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={d.status} />
                        {d.status === "REJECTED" && d.rejectionNote && (
                          <p className="mt-1 text-xs text-muted-foreground">{d.rejectionNote}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmt(d.createdAt)}</td>
                      <td className="px-3 py-2 text-right">
                        {(d.status === "GENERATED" || d.status === "DOWNLOADED") && (
                          <ButtonLink size="sm" variant="ghost" href={`/api/documents/${d.id}/download`}>
                            <Download className="size-4" />
                            {t("download")}
                          </ButtonLink>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabsContent>

      {canValidate && (
        <TabsContent value="review" className="pt-4">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPending")}</p>
          ) : (
            <div className="space-y-3">
              {pending.map((d) => (
                <ReviewRow key={d.id} doc={d} />
              ))}
            </div>
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}

type RequestCardTextKey =
  | "workCertificateTitle"
  | "workCertificateDescription"
  | "leaveConfirmationTitle"
  | "leaveConfirmationDescription"
  | "recommendationLetterTitle"
  | "recommendationLetterDescription"
  | "hrSummaryTitle"
  | "hrSummaryDescription"
  | "mutationLetterTitle"
  | "mutationLetterDescription";

function RequestCard({
  titleKey,
  descriptionKey,
  actionLabel,
  disabled,
  disabledHint,
  children,
}: {
  titleKey: RequestCardTextKey;
  descriptionKey: RequestCardTextKey;
  actionLabel: string;
  disabled?: boolean;
  disabledHint?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("documents");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-muted p-2">
            <FileText className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle>{t(titleKey)}</CardTitle>
            <CardDescription>{t(descriptionKey)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {disabled ? (
          <p className="text-sm text-muted-foreground">{disabledHint}</p>
        ) : (
          <form action={requestDocumentAction} className="space-y-3">
            {children}
            <Button type="submit">{actionLabel}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewRow({ doc }: { doc: DocumentRow }) {
  const t = useTranslations("documents");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          <TypeLabel type={doc.type} /> — {doc.subjectName ?? doc.requesterName ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {format.dateTime(new Date(doc.createdAt), { dateStyle: "medium" })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => startTransition(() => validateDocumentAction(doc.id))}
        >
          <Check className="size-4" />
          {t("approve")}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" variant="ghost" disabled={pending} />}>
            <X className="size-4" />
            {t("reject")}
          </DialogTrigger>
          <DialogContent className="p-6">
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription className="mb-3">{t("rejectDescription")}</DialogDescription>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("rejectNotePlaceholder")}
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={!note.trim() || pending}
                onClick={() =>
                  startTransition(async () => {
                    await rejectDocumentAction(doc.id, note);
                    setOpen(false);
                    setNote("");
                  })
                }
              >
                {t("confirmReject")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
