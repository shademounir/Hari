import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { listDocumentsFor, listPendingValidations } from "@/lib/documents";
import { getMyLeaveRequests } from "@/lib/hr";
import { prisma } from "@/lib/prisma";
import { DocumentsView, type DocumentRow, type LeaveOption, type TeamOption } from "./documents-view";

const ERROR_REASONS = ["forbidden", "not_found", "invalid", "generation_failed"] as const;
type ErrorReason = (typeof ERROR_REASONS)[number];
const isErrorReason = (v: string): v is ErrorReason =>
  (ERROR_REASONS as readonly string[]).includes(v);

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  const user = await requireUser();
  const canRequest = can(user.role, "documents:request");
  const canRequestTeam = can(user.role, "documents:request:team");
  const canValidate = can(user.role, "documents:validate");
  if (!canRequest && !canRequestTeam && !canValidate) redirect("/");

  const t = await getTranslations("documents");
  const params = await searchParams;

  const actor = { userId: user.id, role: user.role, employeeId: user.employeeId };

  const [documents, pending, myLeaves, reports] = await Promise.all([
    listDocumentsFor(actor),
    canValidate ? listPendingValidations(actor) : Promise.resolve([]),
    user.employeeId ? getMyLeaveRequests(user.employeeId) : Promise.resolve([]),
    canRequestTeam
      ? prisma.employee.findMany({
          where: { managerId: user.employeeId ?? "__none__" },
          select: { userId: true, user: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const rows: DocumentRow[] = documents.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    requesterName: d.requesterName,
    subjectName: d.subjectName,
    createdAt: d.createdAt.toISOString(),
    generatedAt: d.generatedAt?.toISOString() ?? null,
    rejectionNote: d.rejectionNote,
  }));

  const pendingRows: DocumentRow[] = pending.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    requesterName: d.requesterName,
    subjectName: d.subjectName,
    createdAt: d.createdAt.toISOString(),
    generatedAt: d.generatedAt?.toISOString() ?? null,
    rejectionNote: d.rejectionNote,
  }));

  const approvedLeaves: LeaveOption[] = myLeaves
    .filter((l) => l.status === "APPROVED")
    .map((l) => ({ id: l.id, type: l.type, startDate: l.startDate, endDate: l.endDate }));

  const teamOptions: TeamOption[] = reports
    .filter((r): r is typeof r & { userId: string } => !!r.userId)
    .map((r) => ({ userId: r.userId, name: r.user.name }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-6 p-4 md:p-8">
        {params.requested === "1" && (
          <div className="rounded-lg border bg-background p-4 text-sm">{t("requestSuccess")}</div>
        )}
        {params.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {isErrorReason(params.error) ? t(`errors.${params.error}`) : t("errors.generic")}
          </div>
        )}

        <DocumentsView
          canRequest={canRequest}
          canRequestTeam={canRequestTeam}
          canValidate={canValidate}
          documents={rows}
          pending={pendingRows}
          approvedLeaves={approvedLeaves}
          teamOptions={teamOptions}
        />
      </div>
    </>
  );
}
