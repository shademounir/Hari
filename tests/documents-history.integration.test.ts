// SCRUM-083 — document history: company-wide view for HR (getCompanyDocumentHistory)
// and the generatedAt field on the requester's own view (getMyDocumentRequests).
// Real DB rows, no mocks, same pattern as documents-authz.integration.test.ts.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getCompanyDocumentHistory, getMyDocumentRequests } from "@/lib/documents";

let ownerUserId = "";

beforeAll(async () => {
  const user = await prisma.user.findUnique({
    where: { email: "collaborateur@hari.ma" },
    select: { id: true },
  });
  ownerUserId = user!.id;
});

afterAll(() => prisma.$disconnect());

describe("documents:download:any permission gates getCompanyDocumentHistory", () => {
  it("is denied to EMPLOYEE and MANAGER", () => {
    expect(can("EMPLOYEE", "documents:download:any")).toBe(false);
    expect(can("MANAGER", "documents:download:any")).toBe(false);
  });
});

describe("getCompanyDocumentHistory — real DB", () => {
  let docId: string;

  afterEach(async () => {
    if (docId) await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
  });

  it("is empty for a caller without documents:download:any", async () => {
    const history = await getCompanyDocumentHistory("EMPLOYEE");
    expect(history).toEqual([]);
  });

  it("lists every document regardless of status for HR", async () => {
    const doc = await prisma.generatedDocument.create({
      data: {
        type: "WORK_CERTIFICATE",
        status: "GENERATED",
        requestedById: ownerUserId,
        pdfUrl: "documents/test-history.pdf",
        generatedAt: new Date(),
      },
      select: { id: true },
    });
    docId = doc.id;

    const history = await getCompanyDocumentHistory("HR_ADMIN");
    const entry = history.find((r) => r.id === docId);
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("GENERATED");
    expect(entry?.generatedAt).not.toBeNull();
    expect(entry?.employeeName).not.toBe("");
  });
});

describe("getMyDocumentRequests — generatedAt", () => {
  let docId: string;

  afterEach(async () => {
    if (docId) await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
  });

  it("is null until the document is GENERATED", async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "REQUESTED", requestedById: ownerUserId },
      select: { id: true },
    });
    docId = doc.id;

    const before = await getMyDocumentRequests(ownerUserId);
    expect(before.find((r) => r.id === docId)?.generatedAt).toBeNull();

    await prisma.generatedDocument.update({
      where: { id: docId },
      data: { status: "GENERATED", pdfUrl: "documents/test.pdf", generatedAt: new Date() },
    });

    const after = await getMyDocumentRequests(ownerUserId);
    expect(after.find((r) => r.id === docId)?.generatedAt).not.toBeNull();
  });
});
