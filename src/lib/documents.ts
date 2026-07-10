// ─────────────────────────────────────────────────────────────────────────
// SCRUM-078/080/081/082/094: the full GeneratedDocument workflow — request,
// validate/reject, PDF generation, download authorization, and history.
//
// Access rules (unchanged from SCRUM-082, extended for `subjectId`):
//   - The requester or the subject of a document (requestedById / subjectId =
//     user.id) may always download it once GENERATED.
//   - HR_ADMIN / SUPER_ADMIN (documents:download:any) may download any document.
//   - Everyone else is forbidden.
//
// The pdfUrl stored in GeneratedDocument is a MinIO object key (e.g.
// "documents/<id>.pdf"), NOT a full URL — the route handler proxies the
// object so MinIO is never exposed directly to the browser (lib/storage.ts).
//
// Per-type authorization (who may request/validate what) lives in the pure,
// unit-tested `lib/documents/rules.ts` — this file is the DB-touching
// orchestration on top of it.
// ─────────────────────────────────────────────────────────────────────────
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import type { GeneratedDocumentType, GeneratedDocumentStatus } from "@prisma/client";
import { localeConfig } from "@/i18n/routing";
import { canRequestType, canValidateType, requiresValidation } from "@/lib/documents/rules";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { generateHrSummaryText } from "@/lib/documents/ai-summary";
import { putDocumentPdf } from "@/lib/storage";
import type { DocumentProfile } from "@/lib/documents/types";

export type DocumentActor = { userId: string; role: Role; employeeId: string | null };

export type DownloadAuthorization =
  | { ok: true; pdfUrl: string; isFirstDownload: boolean }
  | { ok: false; reason: "not_found" | "forbidden" | "not_ready" };

/**
 * Check whether `actor` may download document `id` and prepare the response.
 *
 * When the owner fetches a GENERATED document for the first time, the status
 * is atomically transitioned to DOWNLOADED and `downloadedAt` is stamped.
 * HR downloads (canDownloadAny) never mutate the document status so the owner
 * can still receive their own DOWNLOADED confirmation later.
 */
export async function authorizeDocumentDownload(
  actor: DocumentActor,
  id: string,
): Promise<DownloadAuthorization> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { id: true, pdfUrl: true, status: true, requestedById: true, subjectId: true },
  });

  if (!doc) return { ok: false, reason: "not_found" };

  const isOwner = doc.requestedById === actor.userId || doc.subjectId === actor.userId;
  const canDownloadAny = can(actor.role, "documents:download:any");

  if (!isOwner && !canDownloadAny) {
    return { ok: false, reason: "forbidden" };
  }

  // Document must be GENERATED or DOWNLOADED — REQUESTED / VALIDATED / REJECTED
  // are not yet ready for the employee and never exposed via this route.
  if (doc.status !== "GENERATED" && doc.status !== "DOWNLOADED") {
    return { ok: false, reason: "not_ready" };
  }

  if (!doc.pdfUrl) return { ok: false, reason: "not_ready" };

  // Stamp the first download by the owner (not HR, who doesn't own it).
  const isFirstDownload = isOwner && doc.status === "GENERATED";
  if (isFirstDownload) {
    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { status: "DOWNLOADED", downloadedAt: new Date() },
    });
  }

  return { ok: true, pdfUrl: doc.pdfUrl, isFirstDownload };
}

export type DocumentActionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "forbidden" | "not_found" | "invalid" | "generation_failed" };

export type DocumentView = {
  id: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  requesterName: string | null;
  subjectName: string | null;
  createdAt: Date;
  generatedAt: Date | null;
  rejectionNote: string | null;
};

// ── internal helpers ────────────────────────────────────────────────────

/** Employee row (+ own manager) for a User id, or null if they have no Employee profile. */
async function employeeByUserId(userId: string) {
  return prisma.employee.findUnique({
    where: { userId },
    select: {
      id: true,
      managerId: true,
      title: true,
      department: true,
      startDate: true,
      user: { select: { name: true } },
      manager: { select: { user: { select: { name: true } } } },
    },
  });
}

function toProfile(employee: NonNullable<Awaited<ReturnType<typeof employeeByUserId>>>): DocumentProfile {
  return {
    name: employee.user.name,
    title: employee.title,
    department: employee.department,
    managerName: employee.manager?.user.name ?? null,
    startDate: employee.startDate,
  };
}

const toView = (doc: {
  id: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  requestedBy: { name: string } | null;
  subject: { name: string } | null;
  createdAt: Date;
  generatedAt: Date | null;
  rejectionNote: string | null;
}): DocumentView => ({
  id: doc.id,
  type: doc.type,
  status: doc.status,
  requesterName: doc.requestedBy?.name ?? null,
  subjectName: doc.subject?.name ?? null,
  createdAt: doc.createdAt,
  generatedAt: doc.generatedAt,
  rejectionNote: doc.rejectionNote,
});

const documentListSelect = {
  id: true,
  type: true,
  status: true,
  createdAt: true,
  generatedAt: true,
  rejectionNote: true,
  requestedBy: { select: { name: true } },
  subject: { select: { name: true } },
} as const;

/**
 * Render, upload and finalize a VALIDATED (or auto-approved) document. Safe to
 * retry: on failure it logs and leaves the row at its current pre-generation
 * status rather than inventing a new enum value, so a retry (re-validate) can
 * simply call this again.
 */
async function finalizeGeneration(id: string): Promise<boolean> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { id: true, type: true, requestedById: true, subjectId: true, leaveRequestId: true },
  });
  if (!doc) return false;

  const subjectUserId = doc.subjectId ?? doc.requestedById;
  if (!subjectUserId) return false;
  const employee = await employeeByUserId(subjectUserId);
  if (!employee) return false;
  const profile = toProfile(employee);

  try {
    let buffer: Buffer;
    switch (doc.type) {
      case "WORK_CERTIFICATE":
        buffer = await renderDocumentPdf("WORK_CERTIFICATE", { profile });
        break;
      case "RECOMMENDATION_LETTER":
        buffer = await renderDocumentPdf("RECOMMENDATION_LETTER", { profile });
        break;
      case "MUTATION_LETTER":
        buffer = await renderDocumentPdf("MUTATION_LETTER", { profile, effectiveDate: new Date() });
        break;
      case "LEAVE_CONFIRMATION": {
        if (!doc.leaveRequestId) return false;
        const leave = await prisma.leaveRequest.findUnique({
          where: { id: doc.leaveRequestId },
          select: { type: true, startDate: true, endDate: true, days: true },
        });
        if (!leave) return false;
        buffer = await renderDocumentPdf("LEAVE_CONFIRMATION", {
          profile,
          leaveType: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: leave.days,
        });
        break;
      }
      case "HR_SUMMARY": {
        const locale = await getLocale();
        const language = localeConfig[locale as keyof typeof localeConfig].language as
          | "French"
          | "English";
        const summaryText = await generateHrSummaryText(profile, language);
        buffer = await renderDocumentPdf("HR_SUMMARY", { profile, summaryText });
        break;
      }
      default:
        return false;
    }

    const pdfUrl = await putDocumentPdf(doc.id, buffer);
    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { status: "GENERATED", pdfUrl, generatedAt: new Date() },
    });
    return true;
  } catch (err) {
    console.error(`[documents] PDF generation failed for ${id}:`, err);
    return false;
  }
}

// ── request ──────────────────────────────────────────────────────────────

export type RequestDocumentInput = {
  type: GeneratedDocumentType;
  /** Required for MUTATION_LETTER (or HR requesting on behalf of someone). */
  targetUserId?: string;
  /** Required for LEAVE_CONFIRMATION — the specific leave request it confirms. */
  leaveRequestId?: string;
};

export async function requestDocument(
  actor: DocumentActor,
  input: RequestDocumentInput,
): Promise<DocumentActionResult> {
  const targetUserId = input.targetUserId ?? actor.userId;
  const isSelf = targetUserId === actor.userId;

  let reportsToActor = false;
  if (!isSelf) {
    const targetEmployee = await employeeByUserId(targetUserId);
    if (!targetEmployee) return { ok: false, reason: "not_found" };
    reportsToActor = targetEmployee.managerId === actor.employeeId;
  }

  if (!canRequestType(actor, input.type, { isSelf, reportsToActor })) {
    return { ok: false, reason: "forbidden" };
  }

  let leaveRequestId: string | undefined;
  if (input.type === "LEAVE_CONFIRMATION") {
    if (!input.leaveRequestId) return { ok: false, reason: "invalid" };
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: input.leaveRequestId },
      select: { id: true, status: true, employee: { select: { userId: true } } },
    });
    // Must exist, belong to the target, and already be APPROVED — otherwise
    // there is nothing to confirm yet.
    if (!leave || leave.employee.userId !== targetUserId || leave.status !== "APPROVED") {
      return { ok: false, reason: "invalid" };
    }
    leaveRequestId = leave.id;
  }

  const doc = await prisma.generatedDocument.create({
    data: {
      type: input.type,
      status: "REQUESTED",
      requestedById: actor.userId,
      subjectId: isSelf ? null : targetUserId,
      leaveRequestId,
    },
    select: { id: true },
  });

  if (!requiresValidation(input.type)) {
    const generated = await finalizeGeneration(doc.id);
    if (!generated) return { ok: false, reason: "generation_failed" };
  }

  return { ok: true, id: doc.id };
}

// ── validate / reject ───────────────────────────────────────────────────

async function isManagerOfDocumentSubject(actor: DocumentActor, subjectUserId: string): Promise<boolean> {
  if (!actor.employeeId) return false;
  const subjectEmployee = await employeeByUserId(subjectUserId);
  return subjectEmployee?.managerId === actor.employeeId;
}

export async function validateDocument(actor: DocumentActor, id: string): Promise<DocumentActionResult> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, requestedById: true, subjectId: true },
  });
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.status !== "REQUESTED") return { ok: false, reason: "invalid" };

  const subjectUserId = doc.subjectId ?? doc.requestedById;
  if (!subjectUserId) return { ok: false, reason: "not_found" };
  const isManager = await isManagerOfDocumentSubject(actor, subjectUserId);

  if (!canValidateType(actor, doc.type, isManager)) {
    return { ok: false, reason: "forbidden" };
  }

  await prisma.generatedDocument.update({
    where: { id },
    data: { status: "VALIDATED", validatedById: actor.userId, validatedAt: new Date() },
  });

  const generated = await finalizeGeneration(id);
  if (!generated) return { ok: false, reason: "generation_failed" };
  return { ok: true, id };
}

export async function rejectDocument(
  actor: DocumentActor,
  id: string,
  note: string,
): Promise<DocumentActionResult> {
  if (!note.trim()) return { ok: false, reason: "invalid" };

  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, requestedById: true, subjectId: true },
  });
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.status !== "REQUESTED") return { ok: false, reason: "invalid" };

  const subjectUserId = doc.subjectId ?? doc.requestedById;
  if (!subjectUserId) return { ok: false, reason: "not_found" };
  const isManager = await isManagerOfDocumentSubject(actor, subjectUserId);

  if (!canValidateType(actor, doc.type, isManager)) {
    return { ok: false, reason: "forbidden" };
  }

  await prisma.generatedDocument.update({
    where: { id },
    data: { status: "REJECTED", rejectionNote: note.trim(), rejectedAt: new Date() },
  });

  return { ok: true, id };
}

// ── listings ─────────────────────────────────────────────────────────────

/** `actor`'s own GENERATED-not-yet-downloaded documents — for the bell, not
 * the broader (team/company-scoped) listDocumentsFor below. */
export async function listMyReadyDocuments(
  actor: DocumentActor,
): Promise<{ id: string; type: GeneratedDocumentType }[]> {
  return prisma.generatedDocument.findMany({
    where: {
      status: "GENERATED",
      OR: [{ requestedById: actor.userId }, { subjectId: actor.userId }],
    },
    select: { id: true, type: true },
    orderBy: { generatedAt: "desc" },
  });
}

export type DocumentListFilter = { type?: GeneratedDocumentType; status?: string };

/** Documents visible to `actor`: their own (requested or about them), plus
 * their reports' (MANAGER) or everyone's (HR_ADMIN+) if they can validate. */
export async function listDocumentsFor(
  actor: DocumentActor,
  filter?: DocumentListFilter,
): Promise<DocumentView[]> {
  const where: Record<string, unknown> = {
    ...(filter?.type ? { type: filter.type } : {}),
    ...(filter?.status ? { status: filter.status } : {}),
  };

  if (can(actor.role, "directory:read:all")) {
    // HR/Admin: everything, still filterable.
  } else if (can(actor.role, "documents:validate") && actor.employeeId) {
    where.OR = [
      { requestedById: actor.userId },
      { subjectId: actor.userId },
      { subject: { employee: { managerId: actor.employeeId } } },
    ];
  } else {
    where.OR = [{ requestedById: actor.userId }, { subjectId: actor.userId }];
  }

  const rows = await prisma.generatedDocument.findMany({
    where,
    select: documentListSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

/** REQUESTED documents `actor` is currently authorized to validate/reject. */
export async function listPendingValidations(actor: DocumentActor): Promise<DocumentView[]> {
  if (!can(actor.role, "documents:validate")) return [];

  const rows = await prisma.generatedDocument.findMany({
    where: { status: "REQUESTED" },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      generatedAt: true,
      rejectionNote: true,
      requestedBy: { select: { name: true } },
      subject: { select: { name: true, employee: { select: { managerId: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows
    .filter((r) => canValidateType(actor, r.type, r.subject?.employee?.managerId === actor.employeeId))
    .map(toView);
}
