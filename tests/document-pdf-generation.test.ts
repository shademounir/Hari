// SCRUM-081 — generateAndStoreWorkCertificate. Real DB row for the
// VALIDATED→GENERATED transition, but lib/storage + the PDF renderer are
// mocked — no MinIO dependency, consistent with the deterministic suite's
// no-network rule. (Pure PDF rendering is covered separately in
// work-certificate-pdf.test.ts.)
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  putDocument: vi.fn(async () => "documents/mock-key.pdf"),
}));
vi.mock("@/lib/pdf/work-certificate", () => ({
  renderWorkCertificatePdf: vi.fn(async () => Buffer.from("%PDF-1.4 mock")),
}));

import { prisma } from "@/lib/prisma";
import { generateAndStoreWorkCertificate } from "@/lib/documents";
import { putDocument } from "@/lib/storage";

let ownerUserId = "";

beforeAll(async () => {
  const user = await prisma.user.findUnique({
    where: { email: "collaborateur@hari.ma" },
    select: { id: true },
  });
  ownerUserId = user!.id;
});

afterAll(() => prisma.$disconnect());

describe("generateAndStoreWorkCertificate — real DB, mocked PDF/storage", () => {
  let docId: string;

  beforeEach(async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "VALIDATED", requestedById: ownerUserId },
      select: { id: true },
    });
    docId = doc.id;
  });

  afterEach(async () => {
    await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
  });

  it("renders, stores, and flips a VALIDATED document to GENERATED", async () => {
    const result = await generateAndStoreWorkCertificate(docId);
    expect(result.ok).toBe(true);
    expect(putDocument).toHaveBeenCalled();

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("GENERATED");
    expect(row.pdfUrl).toBe("documents/mock-key.pdf");
    expect(row.generatedAt).not.toBeNull();
  });

  it("is a no-op for a document that isn't VALIDATED", async () => {
    await prisma.generatedDocument.update({ where: { id: docId }, data: { status: "REQUESTED" } });
    const result = await generateAndStoreWorkCertificate(docId);
    expect(result.ok).toBe(false);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REQUESTED");
    expect(row.pdfUrl).toBeNull();
  });
});
