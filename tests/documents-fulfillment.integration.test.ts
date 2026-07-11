// SCRUM-080/081 — HR fulfillment (generateWorkCertificate / rejectDocumentRequest):
// RBAC, status transitions, and audit journaling. Real DB rows, no mocks for
// Prisma; next-intl/server and lib/storage are mocked so this stays fast and
// deterministic (real PDF + real MinIO are covered by the SCRUM-084 e2e test).
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => {
    const dict: Record<string, string> = {
      title: "WORK CERTIFICATE",
      body: "This is to certify that {name} has been employed by {company} as {title} in the {department} department since {startDate}, under a {employmentType} contract.",
      issued: "Issued in {city} on {date}.",
      signOff: "For {company}",
      hr: "Human Resources",
      ref: "Document reference: {id}",
      "employmentType.FULL_TIME": "full-time",
    };
    return (key: string, values?: Record<string, string>) => {
      let s = dict[key] ?? key;
      if (values) for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
      return s;
    };
  }),
}));

vi.mock("@/lib/storage", () => ({
  putDocument: vi.fn(async (_bytes: Uint8Array, id: string) => `documents/${id}.pdf`),
}));

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  generateWorkCertificate,
  rejectDocumentRequest,
  type DocumentActor,
} from "@/lib/documents";
import { putDocument } from "@/lib/storage";

let ownerUserId = "";
let hrUserId = "";
let strangerUserId = ""; // a MANAGER — no documents:download:any

const hr: DocumentActor = { userId: "", role: "HR_ADMIN" };

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: ["collaborateur@hari.ma", "rh@hari.ma", "manager@hari.ma"] } },
    select: { id: true, email: true },
  });
  for (const u of users) {
    if (u.email === "collaborateur@hari.ma") ownerUserId = u.id;
    if (u.email === "rh@hari.ma") { hrUserId = u.id; hr.userId = u.id; }
    if (u.email === "manager@hari.ma") strangerUserId = u.id;
  }
});

afterAll(() => prisma.$disconnect());

describe("documents:download:any permission matrix (gates both fulfillment actions)", () => {
  it("is denied to EMPLOYEE and MANAGER", () => {
    expect(can("EMPLOYEE", "documents:download:any")).toBe(false);
    expect(can("MANAGER", "documents:download:any")).toBe(false);
  });
  it("is granted to HR_ADMIN and SUPER_ADMIN", () => {
    expect(can("HR_ADMIN", "documents:download:any")).toBe(true);
    expect(can("SUPER_ADMIN", "documents:download:any")).toBe(true);
  });
});

describe("generateWorkCertificate — real DB, mocked i18n/storage", () => {
  let docId: string;

  afterEach(async () => {
    if (docId) {
      await prisma.auditLog.deleteMany({ where: { targetId: docId } });
      await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
    }
  });

  it("a caller without documents:download:any is forbidden and the row is untouched", async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "REQUESTED", requestedById: ownerUserId },
    });
    docId = doc.id;

    const stranger: DocumentActor = { userId: strangerUserId, role: "MANAGER" };
    const result = await generateWorkCertificate(stranger, docId);
    expect(result).toEqual({ ok: false, reason: "forbidden" });

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REQUESTED");
    expect(row.pdfUrl).toBeNull();
  });

  it("HR generates the certificate: REQUESTED → GENERATED, stamped and journaled", async () => {
    const doc = await prisma.generatedDocument.create({
      data: {
        type: "WORK_CERTIFICATE",
        status: "REQUESTED",
        requestedById: ownerUserId,
        locale: "fr",
      },
    });
    docId = doc.id;

    const result = await generateWorkCertificate(hr, docId);
    expect(result).toEqual({ ok: true });
    expect(putDocument).toHaveBeenCalledWith(expect.any(Uint8Array), docId);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("GENERATED");
    expect(row.pdfUrl).toBe(`documents/${docId}.pdf`);
    expect(row.validatedById).toBe(hrUserId);
    expect(row.validatedAt).not.toBeNull();
    expect(row.generatedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { targetId: docId } });
    expect(audit?.action).toBe("DOCUMENT_VALIDATED");
    expect(audit?.actorId).toBe(hrUserId);
  });

  it("refuses to generate a REJECTED document (invalid_state)", async () => {
    const doc = await prisma.generatedDocument.create({
      data: {
        type: "WORK_CERTIFICATE",
        status: "REJECTED",
        requestedById: ownerUserId,
        rejectionNote: "already rejected",
      },
    });
    docId = doc.id;

    const result = await generateWorkCertificate(hr, docId);
    expect(result).toEqual({ ok: false, reason: "invalid_state" });
  });
});

describe("rejectDocumentRequest — real DB", () => {
  let docId: string;

  afterEach(async () => {
    if (docId) {
      await prisma.auditLog.deleteMany({ where: { targetId: docId } });
      await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
    }
  });

  it("HR rejects with a note: REQUESTED → REJECTED, journaled", async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "REQUESTED", requestedById: ownerUserId },
    });
    docId = doc.id;

    const result = await rejectDocumentRequest(hr, docId, "Missing payroll confirmation");
    expect(result).toEqual({ ok: true });

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REJECTED");
    expect(row.rejectionNote).toBe("Missing payroll confirmation");
    expect(row.validatedById).toBe(hrUserId);
    expect(row.rejectedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { targetId: docId } });
    expect(audit?.action).toBe("DOCUMENT_REJECTED");
  });

  it("a non-HR caller cannot reject someone else's request", async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "REQUESTED", requestedById: ownerUserId },
    });
    docId = doc.id;

    const stranger: DocumentActor = { userId: strangerUserId, role: "MANAGER" };
    const result = await rejectDocumentRequest(stranger, docId, "not my call");
    expect(result).toEqual({ ok: false, reason: "forbidden" });

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REQUESTED");
  });
});
