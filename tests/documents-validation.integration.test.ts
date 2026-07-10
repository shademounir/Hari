// SCRUM-080 — RBAC + data-layer tests for HR validation/rejection of a
// GeneratedDocument request. Same pattern as documents-authz.integration.test.ts:
// real DB rows, no mocks. Verifies the `documents:validate` permission matrix
// and that decideDocumentRequest / getPendingDocumentRequests enforce it and
// transition status atomically (idempotent — a second decision is a no-op).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { decideDocumentRequest, getPendingDocumentRequests, type Caller } from "@/lib/hr";

let ownerUserId = "";
let hrUserId = "";

// employeeId is irrelevant here: documents:validate is HR/Admin-only and not
// team-scoped, so decideDocumentRequest/getPendingDocumentRequests never read it.
const hrCaller: Caller = { role: "HR_ADMIN", employeeId: null };
const employeeCaller: Caller = { role: "EMPLOYEE", employeeId: null };

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: ["collaborateur@hari.ma", "rh@hari.ma"] } },
    select: { id: true, email: true },
  });
  for (const u of users) {
    if (u.email === "collaborateur@hari.ma") ownerUserId = u.id;
    if (u.email === "rh@hari.ma") hrUserId = u.id;
  }
});

afterAll(() => prisma.$disconnect());

describe("documents:validate permission matrix", () => {
  it("is denied to EMPLOYEE and MANAGER", () => {
    expect(can("EMPLOYEE", "documents:validate")).toBe(false);
    expect(can("MANAGER", "documents:validate")).toBe(false);
  });
  it("is granted to HR_ADMIN and SUPER_ADMIN", () => {
    expect(can("HR_ADMIN", "documents:validate")).toBe(true);
    expect(can("SUPER_ADMIN", "documents:validate")).toBe(true);
  });
});

describe("decideDocumentRequest / getPendingDocumentRequests — real DB", () => {
  let docId: string;

  beforeEach(async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "REQUESTED", requestedById: ownerUserId },
      select: { id: true },
    });
    docId = doc.id;
  });

  afterEach(async () => {
    await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
  });

  it("a caller without documents:validate cannot decide anything", async () => {
    const ok = await decideDocumentRequest(employeeCaller, hrUserId, docId, "VALIDATED");
    expect(ok).toBe(false);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REQUESTED");
  });

  it("HR can validate a REQUESTED document, stamping the validator", async () => {
    const ok = await decideDocumentRequest(hrCaller, hrUserId, docId, "VALIDATED");
    expect(ok).toBe(true);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("VALIDATED");
    expect(row.validatedById).toBe(hrUserId);
    expect(row.validatedAt).not.toBeNull();
  });

  it("HR can reject a REQUESTED document with a note", async () => {
    const ok = await decideDocumentRequest(hrCaller, hrUserId, docId, "REJECTED", "missing paperwork");
    expect(ok).toBe(true);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REJECTED");
    expect(row.rejectionNote).toBe("missing paperwork");
    expect(row.rejectedAt).not.toBeNull();
  });

  it("deciding an already-decided document is a no-op (fails closed, idempotent)", async () => {
    const firstOk = await decideDocumentRequest(hrCaller, hrUserId, docId, "VALIDATED");
    expect(firstOk).toBe(true);

    const secondOk = await decideDocumentRequest(hrCaller, hrUserId, docId, "REJECTED", "too late");
    expect(secondOk).toBe(false);

    // Untouched by the second call — still VALIDATED, no rejection note.
    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("VALIDATED");
    expect(row.rejectionNote).toBeNull();
  });

  it("getPendingDocumentRequests lists REQUESTED docs for a caller who may validate", async () => {
    const pending = await getPendingDocumentRequests(hrCaller);
    expect(pending.some((r) => r.id === docId)).toBe(true);
  });

  it("getPendingDocumentRequests is empty for a caller without documents:validate", async () => {
    const pending = await getPendingDocumentRequests(employeeCaller);
    expect(pending).toEqual([]);
  });
});
