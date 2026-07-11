// SCRUM-081 — pure rendering test for the work-certificate PDF (pdf-lib).
// The renderer takes already-resolved copy strings (no next-intl, no Prisma),
// so this needs no mocking at all — the i18n resolution it used to do inline
// now lives in lib/documents.ts (buildCertificateCopy), tested separately.
import { describe, it, expect } from "vitest";
import { generateWorkCertificatePdf } from "@/lib/pdf/work-certificate";

describe("generateWorkCertificatePdf", () => {
  it("renders a well-formed PDF for English copy", async () => {
    const bytes = await generateWorkCertificatePdf({
      companyName: "HARI",
      copy: {
        title: "WORK CERTIFICATE",
        body: "This is to certify that Jane Doe has been employed by HARI as Engineer in the Engineering department since January 1, 2020, under a full-time contract.\n\nThis certificate is issued at the employee's request to serve where appropriate.",
        issued: "Issued in Casablanca on July 11, 2026.",
        signOff: "For HARI",
        hr: "Human Resources",
        ref: "Document reference: doc_123",
      },
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders a well-formed PDF for French copy (accented characters)", async () => {
    const bytes = await generateWorkCertificatePdf({
      companyName: "HARI",
      copy: {
        title: "ATTESTATION DE TRAVAIL",
        body: "Nous soussignés, HARI, certifions que Jean Dupont est employé(e) en qualité d'Ingénieur au sein du département Ingénierie depuis le 1 janvier 2020, dans le cadre d'un contrat à temps plein.\n\nLa présente attestation est délivrée à la demande de l'intéressé(e) pour servir et valoir ce que de droit.",
        issued: "Fait à Casablanca, le 11 juillet 2026.",
        signOff: "Pour HARI",
        hr: "Ressources Humaines",
        ref: "Référence du document : doc_123",
      },
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
