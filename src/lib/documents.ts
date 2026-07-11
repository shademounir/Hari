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
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { renderWorkCertificatePdf } from "@/lib/pdf/work-certificate";
import { putDocument } from "@/lib/storage";
import { locales, defaultLocale, type Locale } from "@/i18n/routing";

/** Narrow a stored (untrusted-by-type, since it's a plain DB string) locale. */
function asLocale(value: string): Locale {
  return (locales as readonly string[]).includes(value) ? (value as Locale) : defaultLocale;
}

export type DocumentActor = { userId: string; role: Role };

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

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-081: server-side PDF generation, triggered right after HR validation
// (SCRUM-080). Only WORK_CERTIFICATE is supported in Sprint 4. Never throws —
// a generation failure leaves the document VALIDATED (so HR can see it's still
// pending and retry) and logs server-side only, never surfacing internals to
// the requester or the caller, matching "no sensitive technical detail" (AC).
// ─────────────────────────────────────────────────────────────────────────
export type GenerationResult = { ok: boolean };

/**
 * Render + store the PDF for a VALIDATED document, then flip it to GENERATED.
 * Fetches the requester's employee record itself (not passed in) so the source
 * of truth for name/title/department/dates is always the current DB row, not
 * whatever the caller happened to have in hand.
 */
export async function generateAndStoreWorkCertificate(documentId: string): Promise<GenerationResult> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      status: true,
      locale: true,
      requestedBy: {
        select: {
          name: true,
          employee: {
            select: { title: true, department: true, startDate: true, terminationDate: true },
          },
        },
      },
    },
  });

  if (!doc || doc.status !== "VALIDATED" || doc.type !== "WORK_CERTIFICATE") {
    return { ok: false };
  }
  const employee = doc.requestedBy?.employee;
  if (!doc.requestedBy || !employee) return { ok: false };

  try {
    const pdf = await renderWorkCertificatePdf({
      employeeName: doc.requestedBy.name,
      title: employee.title,
      department: employee.department,
      startDate: employee.startDate,
      terminationDate: employee.terminationDate,
      locale: asLocale(doc.locale),
    });
    const key = await putDocument(pdf);

    const res = await prisma.generatedDocument.updateMany({
      where: { id: documentId, status: "VALIDATED" },
      data: { status: "GENERATED", pdfUrl: key, generatedAt: new Date() },
    });
    return { ok: res.count > 0 };
  } catch (err) {
    console.error("[documents] PDF generation failed:", err);
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// The requester's own view of their document requests (status, rejection
// note, download once ready). Scoped by ownership alone — every employee may
// see their own requests regardless of role, mirroring `documents:request`.
// ─────────────────────────────────────────────────────────────────────────
export type MyDocumentView = {
  id: string;
  type: string;
  status: string;
  requestedAt: string;
  generatedAt: string | null;
  rejectionNote: string | null;
};

/** The caller's own document requests, newest first. */
export async function getMyDocumentRequests(userId: string): Promise<MyDocumentView[]> {
  const rows = await prisma.generatedDocument.findMany({
    where: { requestedById: userId },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      requestedAt: true,
      generatedAt: true,
      rejectionNote: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    requestedAt: r.requestedAt.toISOString().slice(0, 10),
    generatedAt: r.generatedAt ? r.generatedAt.toISOString().slice(0, 10) : null,
    rejectionNote: r.rejectionNote,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-083: HR's view of the full document history — every request in the
// company, any status, not just the pending queue (documents/requests.ts).
// Gated on `documents:download:any`: the same permission already means "may
// see/fetch any generated document", so a dedicated history is a natural
// extension of it rather than a new permission (HR/Admin only — a manager,
// even with `directory:read:team`, never sees a team member's documents).
// ─────────────────────────────────────────────────────────────────────────
export type CompanyDocumentView = {
  id: string;
  employeeName: string;
  type: string;
  status: string;
  requestedAt: string;
  generatedAt: string | null;
};

/** Every document request company-wide, newest first. Empty unless the caller may. */
export async function getCompanyDocumentHistory(role: Role): Promise<CompanyDocumentView[]> {
  if (!can(role, "documents:download:any")) return [];

  const rows = await prisma.generatedDocument.findMany({
    orderBy: { requestedAt: "desc" },
    include: { requestedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    employeeName: r.requestedBy?.name ?? "—",
    type: r.type,
    status: r.status,
    requestedAt: r.requestedAt.toISOString().slice(0, 10),
    generatedAt: r.generatedAt ? r.generatedAt.toISOString().slice(0, 10) : null,
  }));
}
