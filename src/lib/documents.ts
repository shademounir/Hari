// ─────────────────────────────────────────────────────────────────────────
// SCRUM-082: authorization layer for GeneratedDocument downloads.
//
// Access rules:
//   - The employee who requested the document (requestedById = user.id) may
//     always download their own document once it reaches GENERATED status.
//   - HR_ADMIN / SUPER_ADMIN (documents:download:any) may download any document.
//   - Everyone else is forbidden — including managers for their team's documents.
//
// The pdfUrl stored in GeneratedDocument is a MinIO object key (e.g.
// "documents/<id>.pdf"), NOT a full URL — consistent with the KB cover-image
// pattern (lib/storage.ts). The route handler proxies the object so MinIO is
// never exposed directly to the browser.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import type { GeneratedDocumentStatus, GeneratedDocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { putDocument } from "@/lib/storage";
import { generateWorkCertificatePdf } from "@/lib/pdf/work-certificate";

export type DocumentActor = { userId: string; role: Role };

const COMPANY_NAME = process.env.COMPANY_NAME || "HARI";

// Localized labels for the employment-type enum, injected into the certificate body.
const EMPLOYMENT_TYPE_LABEL: Record<string, { en: string; fr: string }> = {
  FULL_TIME: { en: "full-time", fr: "à temps plein" },
  PART_TIME: { en: "part-time", fr: "à temps partiel" },
  CONTRACTOR: { en: "contractor", fr: "de prestation (contractuel)" },
};

export type OwnDocument = {
  id: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  requestedAt: Date;
  rejectionNote: string | null;
  canDownload: boolean;
};

/** An employee's own document requests, newest first (self-scoped). */
export async function listOwnDocuments(userId: string): Promise<OwnDocument[]> {
  const rows = await prisma.generatedDocument.findMany({
    where: { requestedById: userId },
    orderBy: { requestedAt: "desc" },
    select: { id: true, type: true, status: true, requestedAt: true, rejectionNote: true },
  });
  return rows.map((d) => ({
    ...d,
    canDownload: d.status === "GENERATED" || d.status === "DOWNLOADED",
  }));
}

export type QueueDocument = {
  id: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  requestedAt: Date;
  requesterName: string | null;
  department: string | null;
};

/**
 * The HR fulfillment queue: every request, newest first, with the requester's name
 * and department for context. Gated to `documents:download:any` (HR/Admin) — the
 * same permission that authorizes serving the finished PDF.
 */
export async function listDocumentQueue(actor: DocumentActor): Promise<QueueDocument[]> {
  if (!can(actor.role, "documents:download:any")) return [];
  const rows = await prisma.generatedDocument.findMany({
    orderBy: [{ requestedAt: "desc" }],
    select: {
      id: true,
      type: true,
      status: true,
      requestedAt: true,
      requestedBy: { select: { name: true, employee: { select: { department: true } } } },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    requestedAt: d.requestedAt,
    requesterName: d.requestedBy?.name ?? null,
    department: d.requestedBy?.employee?.department ?? null,
  }));
}

export type FulfillResult = { ok: true } | { ok: false; reason: string };

/**
 * HR fulfillment: validate a request and generate the real PDF in one atomic step.
 * Gated to `documents:download:any`. Loads the requester's employee record, renders
 * the certificate, uploads it to private storage, and transitions the document to
 * GENERATED with the pdfUrl + validator stamps. Idempotent-ish: only REQUESTED /
 * VALIDATED documents may be generated (never re-generate a downloaded one).
 */
export async function generateWorkCertificate(
  actor: DocumentActor,
  id: string,
  locale: string,
): Promise<FulfillResult> {
  if (!can(actor.role, "documents:download:any")) return { ok: false, reason: "forbidden" };

  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, requestedById: true },
  });
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.status !== "REQUESTED" && doc.status !== "VALIDATED") {
    return { ok: false, reason: "invalid_state" };
  }
  if (!doc.requestedById) return { ok: false, reason: "no_requester" };

  const requester = await prisma.user.findUnique({
    where: { id: doc.requestedById },
    select: {
      name: true,
      employee: {
        select: { title: true, department: true, startDate: true, employmentType: true, location: true },
      },
    },
  });
  if (!requester?.employee) return { ok: false, reason: "no_employee" };
  const emp = requester.employee;

  const loc = locale === "fr" ? "fr" : "en";
  const employmentType =
    (EMPLOYMENT_TYPE_LABEL[emp.employmentType]?.[loc]) ?? emp.employmentType.toLowerCase();

  const bytes = await generateWorkCertificatePdf({
    locale: loc,
    companyName: COMPANY_NAME,
    employeeName: requester.name,
    jobTitle: emp.title,
    department: emp.department,
    startDate: emp.startDate,
    employmentType,
    city: emp.location,
    issueDate: new Date(),
    documentId: doc.id,
  });

  const key = await putDocument(bytes, doc.id);
  const now = new Date();
  await prisma.generatedDocument.update({
    where: { id: doc.id },
    data: {
      status: "GENERATED",
      pdfUrl: key,
      validatedById: actor.userId,
      validatedAt: now,
      generatedAt: now,
    },
  });
  return { ok: true };
}

/** HR rejects a request with a note. Gated to `documents:download:any`. */
export async function rejectDocumentRequest(
  actor: DocumentActor,
  id: string,
  note: string,
): Promise<FulfillResult> {
  if (!can(actor.role, "documents:download:any")) return { ok: false, reason: "forbidden" };
  const doc = await prisma.generatedDocument.findUnique({ where: { id }, select: { status: true } });
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.status !== "REQUESTED" && doc.status !== "VALIDATED") {
    return { ok: false, reason: "invalid_state" };
  }
  await prisma.generatedDocument.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionNote: note.slice(0, 500),
      validatedById: actor.userId,
      rejectedAt: new Date(),
    },
  });
  return { ok: true };
}

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
    select: {
      id: true,
      pdfUrl: true,
      status: true,
      requestedById: true,
    },
  });

  if (!doc) return { ok: false, reason: "not_found" };

  const isOwner = doc.requestedById === actor.userId;
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
