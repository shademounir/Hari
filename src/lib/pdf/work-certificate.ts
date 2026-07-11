// ─────────────────────────────────────────────────────────────────────────
// Real work-certificate ("attestation de travail") PDF generation (SCRUM-081).
// Pure and dependency-light (pdf-lib only) — takes plain, already-localized
// strings and returns bytes. No Prisma, no storage, no next-intl, no
// `server-only`, so it's trivially unit-testable and can be rendered in a
// standalone script. The DB/storage orchestration AND the i18n resolution
// (messages/{en,fr}.json → WorkCertificateCopy) both live in lib/documents.ts —
// this module doesn't know or care which locale it's rendering, only that
// every string it draws was handed to it already resolved.
// ─────────────────────────────────────────────────────────────────────────
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Every translatable string block on the certificate, already resolved. */
export type WorkCertificateCopy = {
  title: string;
  body: string;
  issued: string;
  signOff: string;
  hr: string;
  ref: string;
};

export type WorkCertificateData = {
  companyName: string;
  copy: WorkCertificateCopy;
};

const A4 = { width: 595.28, height: 841.89 }; // points
const MARGIN = 64;
const INK = rgb(0.11, 0.13, 0.19);
const MUTED = rgb(0.42, 0.45, 0.52);
const RULE = rgb(0.82, 0.84, 0.88);
const ACCENT = rgb(0.31, 0.36, 0.84);

/** Greedy word-wrap to a max width, in the given font/size. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function generateWorkCertificatePdf(data: WorkCertificateData): Promise<Uint8Array> {
  const { copy } = data;
  const doc = await PDFDocument.create();
  doc.setTitle(copy.title);
  doc.setProducer("HARI");
  doc.setCreator("HARI");

  const page: PDFPage = doc.addPage([A4.width, A4.height]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = A4.width - MARGIN * 2;

  // Letterhead: company name + accent rule.
  page.drawText(data.companyName, { x: MARGIN, y: A4.height - MARGIN, size: 16, font: bold, color: INK });
  page.drawLine({
    start: { x: MARGIN, y: A4.height - MARGIN - 14 },
    end: { x: A4.width - MARGIN, y: A4.height - MARGIN - 14 },
    thickness: 2,
    color: ACCENT,
  });

  // Title, centered.
  const titleSize = 22;
  const titleWidth = bold.widthOfTextAtSize(copy.title, titleSize);
  const titleY = A4.height - MARGIN - 90;
  page.drawText(copy.title, {
    x: (A4.width - titleWidth) / 2,
    y: titleY,
    size: titleSize,
    font: bold,
    color: INK,
  });

  // Body paragraph, justified-left with wrapping.
  const bodySize = 12;
  const lineHeight = 20;
  let y = titleY - 56;
  for (const line of wrapText(copy.body, regular, bodySize, contentWidth)) {
    if (line === "") {
      y -= lineHeight * 0.6; // paragraph gap
      continue;
    }
    page.drawText(line, { x: MARGIN, y, size: bodySize, font: regular, color: INK });
    y -= lineHeight;
  }

  // Issue line.
  y -= 24;
  page.drawText(copy.issued, { x: MARGIN, y, size: bodySize, font: regular, color: INK });

  // Signature block, right-aligned.
  const sigX = A4.width - MARGIN - 200;
  let sy = y - 70;
  page.drawText(copy.signOff, { x: sigX, y: sy, size: bodySize, font: bold, color: INK });
  sy -= 16;
  page.drawText(copy.hr, { x: sigX, y: sy, size: bodySize, font: regular, color: MUTED });
  sy -= 12;
  page.drawLine({ start: { x: sigX, y: sy }, end: { x: sigX + 200, y: sy }, thickness: 1, color: RULE });

  // Footer: verification reference.
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 22 },
    end: { x: A4.width - MARGIN, y: MARGIN + 22 },
    thickness: 0.5,
    color: RULE,
  });
  page.drawText(copy.ref, { x: MARGIN, y: MARGIN, size: 8, font: regular, color: MUTED });

  return doc.save();
}
