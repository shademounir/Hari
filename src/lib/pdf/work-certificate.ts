// ─────────────────────────────────────────────────────────────────────────
// SCRUM-081: server-side rendering of the work-certificate PDF (the only
// GeneratedDocumentType Sprint 4 supports). Pure w.r.t. its input — no Prisma,
// no storage — so the caller (lib/documents.ts) owns fetching + persisting.
// Localized via next-intl, consistent with the app's mandatory-i18n rule: every
// user-facing string is a message key under `documents.certificate`
// (messages/{en,fr}.json), never a literal here. `locale` is passed in
// explicitly (the requester's, captured at request time) rather than read via
// `getLocale()` — the current request's cookie would instead reflect whoever
// happens to be validating the request (an HR admin), not the requester.
// ─────────────────────────────────────────────────────────────────────────
import PDFDocument from "pdfkit";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export type WorkCertificateInput = {
  employeeName: string;
  title: string;
  department: string;
  startDate: Date;
  /** Set only for a former employee (Employee.status === "TERMINATED"). */
  terminationDate: Date | null;
  locale: Locale;
};

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
    date,
  );
}

/** Render a work certificate as PDF bytes, in `input.locale`. */
export async function renderWorkCertificatePdf(input: WorkCertificateInput): Promise<Buffer> {
  const { locale } = input;
  const t = await getTranslations({ locale, namespace: "documents.certificate" });

  const body = input.terminationDate
    ? t("bodyTerminated", {
        name: input.employeeName,
        title: input.title,
        department: input.department,
        startDate: formatDate(input.startDate, locale),
        endDate: formatDate(input.terminationDate, locale),
      })
    : t("bodyActive", {
        name: input.employeeName,
        title: input.title,
        department: input.department,
        startDate: formatDate(input.startDate, locale),
      });

  const doc = new PDFDocument({ size: "A4", margin: 72 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(20).text(t("heading"), { align: "center" });
  doc.moveDown(0.5);
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#555555")
    .text(t("issuedOn", { date: formatDate(new Date(), locale) }), { align: "center" });
  doc.moveDown(2);
  doc.fillColor("#000000").fontSize(12).text(body, { align: "left", lineGap: 6 });
  doc.moveDown(3);
  doc.fontSize(9).fillColor("#888888").text(t("footer"), { align: "center" });

  doc.end();
  return done;
}
