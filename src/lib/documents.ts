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
