// SCRUM-082 — RBAC authorization tests for GeneratedDocument downloads.
//
// Same pattern as alerts-authz.integration.test.ts: real DB rows, no mocks.
// We verify that the authorization helper (authorizeDocumentDownload) correctly
// enforces the ownership + role rules and mutates the document status only on
// the owner's first download.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  authorizeDocumentDownload,
  requestDocument,
  validateDocument,
  rejectDocument,
  type DocumentActor,
} from "@/lib/documents";

// HR_SUMMARY generation calls the live model (lib/documents/ai-summary.ts) —
// mocked here so the deterministic suite never needs OPENROUTER_API_KEY or
// network, per AGENTS.md's `npm test` contract.
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Mocked HR summary, first paragraph.\n\nMocked second paragraph.",
  }),
}));

// ── actors ────────────────────────────────────────────────────────────────────
// "owner" = the employee who requested the document
// "stranger" = another employee (we reuse the manager's userId — no role check there)
// "hr" = HR_ADMIN who can download anything
const actors: Record<"owner" | "stranger" | "hr", DocumentActor> = {
  owner:    { userId: "", role: "EMPLOYEE", employeeId: null },
  stranger: { userId: "stranger-user-id",  role: "EMPLOYEE", employeeId: null },
  hr:       { userId: "", role: "HR_ADMIN", employeeId: null },
};

// SCRUM-094 workflow actors: manager@hari.ma manages collaborateur@hari.ma in
// the seed data — a real (manager, report) pair for the MUTATION_LETTER tests.
const workflow: {
  manager: DocumentActor;
  collaborateur: DocumentActor;
  collaborateurUserId: string;
  hr: DocumentActor;
} = {
  manager: { userId: "", role: "MANAGER", employeeId: null },
  collaborateur: { userId: "", role: "EMPLOYEE", employeeId: null },
  collaborateurUserId: "",
  hr: { userId: "", role: "HR_ADMIN", employeeId: null },
};

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: ["collaborateur@hari.ma", "rh@hari.ma", "manager@hari.ma"] } },
    select: { id: true, email: true, employee: { select: { id: true } } },
  });
  for (const u of users) {
    if (u.email === "collaborateur@hari.ma") {
      actors.owner.userId = u.id;
      workflow.collaborateur.userId = u.id;
      workflow.collaborateur.employeeId = u.employee?.id ?? null;
      workflow.collaborateurUserId = u.id;
    }
    if (u.email === "rh@hari.ma") {
      actors.hr.userId = u.id;
      workflow.hr.userId = u.id;
      workflow.hr.employeeId = u.employee?.id ?? null;
    }
    if (u.email === "manager@hari.ma") {
      workflow.manager.userId = u.id;
      workflow.manager.employeeId = u.employee?.id ?? null;
    }
  }
});

afterAll(() => prisma.$disconnect());

// ── RBAC matrix (pure, no DB) ─────────────────────────────────────────────────
describe("documents:download:any permission matrix", () => {
  it("is denied to EMPLOYEE and MANAGER", () => {
    expect(can("EMPLOYEE", "documents:download:any")).toBe(false);
    expect(can("MANAGER",  "documents:download:any")).toBe(false);
  });
  it("is granted to HR_ADMIN and SUPER_ADMIN", () => {
    expect(can("HR_ADMIN",    "documents:download:any")).toBe(true);
    expect(can("SUPER_ADMIN", "documents:download:any")).toBe(true);
  });
});

// ── integration: real DB rows ─────────────────────────────────────────────────
describe("authorizeDocumentDownload — real DB", () => {
  let docId: string;

  // Create a GENERATED document owned by "owner" before each test.
  beforeEach(async () => {
    const doc = await prisma.generatedDocument.create({
      data: {
        type:          "WORK_CERTIFICATE",
        status:        "GENERATED",
        requestedById: actors.owner.userId,
        pdfUrl:        "documents/test-scrum082.pdf",
      },
      select: { id: true },
    });
    docId = doc.id;
  });

  afterEach(async () => {
    await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
  });

  it("owner can download their own document and it is marked DOWNLOADED", async () => {
    const result = await authorizeDocumentDownload(actors.owner, docId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isFirstDownload).toBe(true);
    expect(result.pdfUrl).toBe("documents/test-scrum082.pdf");

    // Status must have transitioned to DOWNLOADED.
    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("DOWNLOADED");
    expect(row.downloadedAt).not.toBeNull();
  });

  it("owner downloading an already DOWNLOADED document is still allowed (idempotent)", async () => {
    // Simulate: already downloaded once.
    await prisma.generatedDocument.update({
      where: { id: docId },
      data:  { status: "DOWNLOADED", downloadedAt: new Date() },
    });

    const result = await authorizeDocumentDownload(actors.owner, docId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isFirstDownload).toBe(false); // not a first download
  });

  it("another employee (stranger) cannot download the document — forbidden", async () => {
    const result = await authorizeDocumentDownload(actors.stranger, docId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("forbidden");

    // The row must be untouched.
    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("GENERATED");
    expect(row.downloadedAt).toBeNull();
  });

  it("HR_ADMIN can download any document without changing its status", async () => {
    const result = await authorizeDocumentDownload(actors.hr, docId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isFirstDownload).toBe(false); // HR never triggers the DOWNLOADED transition

    // Status must remain GENERATED — the owner hasn't downloaded yet.
    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("GENERATED");
    expect(row.downloadedAt).toBeNull();
  });

  it("returns not_found for a non-existent document", async () => {
    const result = await authorizeDocumentDownload(actors.owner, "non-existent-id");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_found");
  });

  it("returns not_ready when the document is still REQUESTED or VALIDATED", async () => {
    for (const status of ["REQUESTED", "VALIDATED"] as const) {
      await prisma.generatedDocument.update({ where: { id: docId }, data: { status } });

      const result = await authorizeDocumentDownload(actors.owner, docId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not_ready");
    }
  });

  it("returns not_ready when pdfUrl is null (PDF not yet generated)", async () => {
    await prisma.generatedDocument.update({ where: { id: docId }, data: { pdfUrl: null } });

    const result = await authorizeDocumentDownload(actors.owner, docId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_ready");
  });
});

// ── SCRUM-094: full request/validate/reject workflow — real DB (+ MinIO for
// PDF upload; the generation step calls putDocumentPdf) ────────────────────
describe("requestDocument / validateDocument / rejectDocument — real DB", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length) {
      await prisma.generatedDocument.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
  });

  it("EMPLOYEE can request WORK_CERTIFICATE for themselves — stays REQUESTED", async () => {
    const result = await requestDocument(workflow.collaborateur, { type: "WORK_CERTIFICATE" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdIds.push(result.id);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.status).toBe("REQUESTED");
  });

  it("EMPLOYEE cannot request MUTATION_LETTER — forbidden", async () => {
    const result = await requestDocument(workflow.collaborateur, {
      type: "MUTATION_LETTER",
      targetUserId: workflow.collaborateurUserId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("forbidden");
  });

  it("MANAGER can request MUTATION_LETTER for their own report", async () => {
    const result = await requestDocument(workflow.manager, {
      type: "MUTATION_LETTER",
      targetUserId: workflow.collaborateurUserId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdIds.push(result.id);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.status).toBe("REQUESTED");
    expect(row.subjectId).toBe(workflow.collaborateurUserId);
    expect(row.requestedById).toBe(workflow.manager.userId);
  });

  it("MANAGER cannot request MUTATION_LETTER for someone who isn't their report", async () => {
    const result = await requestDocument(workflow.manager, {
      type: "MUTATION_LETTER",
      targetUserId: workflow.hr.userId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("forbidden");
  });

  it("LEAVE_CONFIRMATION without a leaveRequestId is invalid", async () => {
    const result = await requestDocument(workflow.collaborateur, { type: "LEAVE_CONFIRMATION" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
  });

  it("LEAVE_CONFIRMATION for an APPROVED leave auto-generates immediately", async () => {
    if (!workflow.collaborateur.employeeId) throw new Error("collaborateur has no Employee row");
    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: workflow.collaborateur.employeeId,
        type: "VACATION",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-05"),
        days: 5,
        status: "APPROVED",
      },
      select: { id: true },
    });

    try {
      const result = await requestDocument(workflow.collaborateur, {
        type: "LEAVE_CONFIRMATION",
        leaveRequestId: leave.id,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      createdIds.push(result.id);

      const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: result.id } });
      expect(row.status).toBe("GENERATED");
      expect(row.pdfUrl).toBe(`documents/${result.id}.pdf`);
    } finally {
      await prisma.leaveRequest.delete({ where: { id: leave.id } }).catch(() => {});
    }
  });

  it("LEAVE_CONFIRMATION for a PENDING (not yet approved) leave is invalid", async () => {
    if (!workflow.collaborateur.employeeId) throw new Error("collaborateur has no Employee row");
    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: workflow.collaborateur.employeeId,
        type: "SICK",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-02"),
        days: 1,
        status: "PENDING",
      },
      select: { id: true },
    });

    try {
      const result = await requestDocument(workflow.collaborateur, {
        type: "LEAVE_CONFIRMATION",
        leaveRequestId: leave.id,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid");
    } finally {
      await prisma.leaveRequest.delete({ where: { id: leave.id } }).catch(() => {});
    }
  });

  it("HR_SUMMARY auto-generates via the (mocked) AI call — no validation step", async () => {
    const result = await requestDocument(workflow.collaborateur, { type: "HR_SUMMARY" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdIds.push(result.id);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.status).toBe("GENERATED");
    expect(row.validatedById).toBeNull(); // never went through validateDocument
  });

  it("MANAGER can validate MUTATION_LETTER for their own report — generates the PDF", async () => {
    const requested = await requestDocument(workflow.manager, {
      type: "MUTATION_LETTER",
      targetUserId: workflow.collaborateurUserId,
    });
    if (!requested.ok) throw new Error("setup: request failed");
    createdIds.push(requested.id);

    const result = await validateDocument(workflow.manager, requested.id);
    expect(result.ok).toBe(true);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: requested.id } });
    expect(row.status).toBe("GENERATED");
    expect(row.validatedById).toBe(workflow.manager.userId);
  });

  it("MANAGER cannot validate a WORK_CERTIFICATE, even for their own report", async () => {
    const requested = await requestDocument(workflow.collaborateur, { type: "WORK_CERTIFICATE" });
    if (!requested.ok) throw new Error("setup: request failed");
    createdIds.push(requested.id);

    const result = await validateDocument(workflow.manager, requested.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("forbidden");
  });

  it("HR_ADMIN can validate a WORK_CERTIFICATE", async () => {
    const requested = await requestDocument(workflow.collaborateur, { type: "WORK_CERTIFICATE" });
    if (!requested.ok) throw new Error("setup: request failed");
    createdIds.push(requested.id);

    const result = await validateDocument(workflow.hr, requested.id);
    expect(result.ok).toBe(true);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: requested.id } });
    expect(row.status).toBe("GENERATED");
  });

  it("rejectDocument requires a non-empty note", async () => {
    const requested = await requestDocument(workflow.collaborateur, { type: "WORK_CERTIFICATE" });
    if (!requested.ok) throw new Error("setup: request failed");
    createdIds.push(requested.id);

    const result = await rejectDocument(workflow.hr, requested.id, "   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
  });

  it("HR_ADMIN can reject a request with a note — status REJECTED, note stored", async () => {
    const requested = await requestDocument(workflow.collaborateur, { type: "WORK_CERTIFICATE" });
    if (!requested.ok) throw new Error("setup: request failed");
    createdIds.push(requested.id);

    const result = await rejectDocument(workflow.hr, requested.id, "Missing manager sign-off");
    expect(result.ok).toBe(true);

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: requested.id } });
    expect(row.status).toBe("REJECTED");
    expect(row.rejectionNote).toBe("Missing manager sign-off");
  });
});
