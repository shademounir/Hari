// SCRUM-082 — RBAC authorization tests for GeneratedDocument downloads.
//
// Same pattern as alerts-authz.integration.test.ts: real DB rows, no mocks.
// We verify that the authorization helper (authorizeDocumentDownload) correctly
// enforces the ownership + role rules and mutates the document status only on
// the owner's first download.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ROLE_PERMISSIONS, builtinSubject, can } from "@/lib/rbac";
import { authorizeDocumentDownload, type DocumentActor } from "@/lib/documents";

// ── actors ────────────────────────────────────────────────────────────────────
// "owner" = the employee who requested the document
// "stranger" = another employee (we reuse the manager's userId — no role check there)
// "hr" = HR_ADMIN who can download anything
const actors: Record<"owner" | "stranger" | "hr", DocumentActor> = {
  owner:    { userId: "", role: "EMPLOYEE", permissions: DEFAULT_ROLE_PERMISSIONS["EMPLOYEE"] },
  stranger: { userId: "stranger-user-id", role: "EMPLOYEE", permissions: DEFAULT_ROLE_PERMISSIONS["EMPLOYEE"] },
  hr:       { userId: "", role: "HR_ADMIN", permissions: DEFAULT_ROLE_PERMISSIONS["HR_ADMIN"] },
};

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: ["collaborateur@hari.ma", "rh@hari.ma"] } },
    select: { id: true, email: true },
  });
  for (const u of users) {
    if (u.email === "collaborateur@hari.ma") actors.owner.userId = u.id;
    if (u.email === "rh@hari.ma")            actors.hr.userId    = u.id;
  }
});

afterAll(() => prisma.$disconnect());

// ── RBAC matrix (pure, no DB) ─────────────────────────────────────────────────
describe("documents:download:any permission matrix", () => {
  it("is denied to EMPLOYEE and MANAGER", () => {
    expect(can(builtinSubject("EMPLOYEE"), "documents:download:any")).toBe(false);
    expect(can(builtinSubject("MANAGER"),  "documents:download:any")).toBe(false);
  });
  it("is granted to HR_ADMIN and SUPER_ADMIN", () => {
    expect(can(builtinSubject("HR_ADMIN"),    "documents:download:any")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "documents:download:any")).toBe(true);
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
