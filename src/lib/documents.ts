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
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { putDocument } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";
import { generateWorkCertificatePdf, type WorkCertificateCopy } from "@/lib/pdf/work-certificate";
import { locales, defaultLocale, localeConfig, type Locale } from "@/i18n/routing";

export type DocumentActor = { userId: string; role: Role };

const COMPANY_NAME = process.env.COMPANY_NAME || "HARI";

/** Narrow a stored (untrusted-by-type, since it's a plain DB string) locale. */
function asLocale(value: string): Locale {
  return (locales as readonly string[]).includes(value) ? (value as Locale) : defaultLocale;
}

function fmtDate(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeConfig[locale].dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export type OwnDocument = {
  id: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  requestedAt: Date;
  generatedAt: Date | null;
  rejectionNote: string | null;
  canDownload: boolean;
};

/** An employee's own document requests, newest first (self-scoped). */
export async function listOwnDocuments(userId: string): Promise<OwnDocument[]> {
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
  generatedAt: Date | null;
  requesterName: string | null;
  department: string | null;
};

/**
 * The HR fulfillment queue: every request, newest first, with the requester's name
 * and department for context. Gated to `documents:download:any` (HR/Admin) — the
 * same permission that authorizes serving the finished PDF. Also doubles as the
 * document history (SCRUM-083): every status is included, not just pending ones.
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
      generatedAt: true,
      requestedBy: { select: { name: true, employee: { select: { department: true } } } },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    requestedAt: d.requestedAt,
    generatedAt: d.generatedAt,
    requesterName: d.requestedBy?.name ?? null,
    department: d.requestedBy?.employee?.department ?? null,
  }));
}

export type FulfillResult = { ok: true } | { ok: false; reason: string };

/**
 * Resolve the certificate's translatable copy from messages/{en,fr}.json —
 * documents.certificate.* — for the given (requester's) locale. Kept separate
 * from generateWorkCertificate so the i18n concern stays out of the pure
 * pdf-lib renderer (lib/pdf/work-certificate.ts).
 */
async function buildCertificateCopy(
  locale: Locale,
  vars: {
    employeeName: string;
    jobTitle: string;
    department: string;
    startDate: Date;
    employmentType: string;
    city: string;
    issueDate: Date;
    documentId: string;
  },
): Promise<WorkCertificateCopy> {
  const t = await getTranslations({ locale, namespace: "documents.certificate" });
  const employmentType = t(`employmentType.${vars.employmentType}` as "employmentType.FULL_TIME");
  return {
    title: t("title"),
    body: t("body", {
      name: vars.employeeName,
      company: COMPANY_NAME,
      title: vars.jobTitle,
      department: vars.department,
      startDate: fmtDate(vars.startDate, locale),
      employmentType,
    }),
    issued: t("issued", { city: vars.city, date: fmtDate(vars.issueDate, locale) }),
    signOff: t("signOff", { company: COMPANY_NAME }),
    hr: t("hr"),
    ref: t("ref", { id: vars.documentId }),
  };
}

/**
 * HR fulfillment: validate a request and generate the real PDF in one atomic step.
 * Gated to `documents:download:any`. Loads the requester's employee record, renders
 * the certificate in the REQUESTER's own locale (captured at request time — not
 * whichever HR admin happens to click, since the app only has a per-browser locale
 * cookie, no per-account preference), uploads it to private storage, and
 * transitions the document to GENERATED with the pdfUrl + validator stamps.
 * Journals the decision (SCRUM-080's audit requirement). Only REQUESTED /
 * VALIDATED documents may be generated (never re-generate a downloaded one).
 */
export async function generateWorkCertificate(
  actor: DocumentActor,
  id: string,
): Promise<FulfillResult> {
  if (!can(actor.role, "documents:download:any")) return { ok: false, reason: "forbidden" };

  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, requestedById: true, locale: true },
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
  const locale = asLocale(doc.locale);

  const copy = await buildCertificateCopy(locale, {
    employeeName: requester.name,
    jobTitle: emp.title,
    department: emp.department,
    startDate: emp.startDate,
    employmentType: emp.employmentType,
    city: emp.location,
    issueDate: new Date(),
    documentId: doc.id,
  });

  const bytes = await generateWorkCertificatePdf({ companyName: COMPANY_NAME, copy });

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
  await recordAudit(
    { userId: actor.userId, role: actor.role },
    { action: "DOCUMENT_VALIDATED", targetType: "GeneratedDocument", targetId: doc.id },
  );
  return { ok: true };
}

/** HR rejects a request with a note. Gated to `documents:download:any`. Journals the decision. */
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
  await recordAudit(
    { userId: actor.userId, role: actor.role },
    { action: "DOCUMENT_REJECTED", targetType: "GeneratedDocument", targetId: id },
  );
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
