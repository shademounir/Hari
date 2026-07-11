// SCRUM-084 — end-to-end coverage of the attestation journey: request → HR
// fulfillment (generate/reject) → download, plus the RBAC-denial cases.
//
// Unlike documents-fulfillment.integration.test.ts (which mocks storage to
// stay fast), this exercises the REAL pipeline — actual pdf-lib rendering +
// actual MinIO upload — against the same Postgres + MinIO CI already spins up
// for the KB-cover seed (see .github/workflows/test.yml), so it catches
// integration bugs the mocked unit tests can't (this is exactly how the
// requester-locale bug was confirmed: by reading the generated PDF's actual
// bytes back out of MinIO).
//
// next-intl/server is still mocked: `getTranslations` refuses to run outside
// an actual Next.js server-component request under Vitest's module
// resolution. That only affects the certificate's TEXT content (already
// covered by work-certificate-pdf.test.ts) — everything else here is real.
//
// Runs under the existing `npm test` CI job (push + pull_request on
// .github/workflows/test.yml) — no separate workflow needed.
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

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getObject, deleteObject } from "@/lib/storage";
import {
  authorizeDocumentDownload,
  generateWorkCertificate,
  rejectDocumentRequest,
  type DocumentActor,
} from "@/lib/documents";

let ownerUserId = "";
let hrUserId = "";
let strangerUserId = ""; // a MANAGER — neither owner nor documents:download:any

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

describe("SCRUM-084: full attestation journey — request → generate → download (real PDF + MinIO)", () => {
  let docId: string;
  let pdfKey: string | null = null;

  afterEach(async () => {
    if (pdfKey) await deleteObject(pdfKey).catch(() => {});
    pdfKey = null;
    if (docId) {
      await prisma.auditLog.deleteMany({ where: { targetId: docId } });
      await prisma.generatedDocument.delete({ where: { id: docId } }).catch(() => {});
    }
  });

  it("walks the entire journey with correct status transitions and a real, well-formed PDF", async () => {
    // 1. Request (SCRUM-079) — a REQUESTED row, no pdfUrl yet.
    const requested = await prisma.generatedDocument.create({
      data: {
        type: "WORK_CERTIFICATE",
        status: "REQUESTED",
        requestedById: ownerUserId,
        locale: "en",
      },
    });
    docId = requested.id;
    expect(requested.status).toBe("REQUESTED");
    expect(requested.pdfUrl).toBeNull();

    // 2. HR fulfills the request (SCRUM-080/081) — REQUESTED → GENERATED, real
    //    pdf-lib render + real MinIO upload, validator stamped, journaled.
    const result = await generateWorkCertificate(hr, docId);
    expect(result).toEqual({ ok: true });

    let row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("GENERATED");
    expect(row.pdfUrl).toBe(`documents/${docId}.pdf`);
    expect(row.validatedById).toBe(hrUserId);
    expect(row.validatedAt).not.toBeNull();
    expect(row.generatedAt).not.toBeNull();
    pdfKey = row.pdfUrl;

    const audit = await prisma.auditLog.findFirst({ where: { targetId: docId } });
    expect(audit?.action).toBe("DOCUMENT_VALIDATED");

    // The stored object is a real, well-formed PDF — read straight back from
    // MinIO (not through the app), proving the upload actually landed.
    const stored = await getObject(row.pdfUrl!);
    expect(stored).not.toBeNull();
    if (stored) {
      expect(stored.contentType).toBe("application/pdf");
      const bytes = new Uint8Array(await new Response(stored.stream).arrayBuffer());
      expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    }

    // 3. Owner downloads (SCRUM-082) — GENERATED → DOWNLOADED on first fetch.
    const owner: DocumentActor = { userId: ownerUserId, role: "EMPLOYEE" };
    const download = await authorizeDocumentDownload(owner, docId);
    expect(download.ok).toBe(true);
    if (download.ok) {
      expect(download.isFirstDownload).toBe(true);
      expect(download.pdfUrl).toBe(row.pdfUrl);
    }
    row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("DOWNLOADED");
    expect(row.downloadedAt).not.toBeNull();
  });

  it("denies download to a third party who neither owns the document nor holds documents:download:any", async () => {
    const doc = await prisma.generatedDocument.create({
      data: {
        type: "WORK_CERTIFICATE",
        status: "GENERATED",
        requestedById: ownerUserId,
        pdfUrl: "documents/e2e-stranger-test.pdf",
        generatedAt: new Date(),
      },
    });
    docId = doc.id;

    expect(can("MANAGER", "documents:download:any")).toBe(false);
    const stranger: DocumentActor = { userId: strangerUserId, role: "MANAGER" };
    const result = await authorizeDocumentDownload(stranger, docId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden");

    // A denied attempt must not mutate the document.
    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("GENERATED");
    expect(row.downloadedAt).toBeNull();
  });

  it("a non-HR caller cannot generate or reject a request, and it stays REQUESTED", async () => {
    const doc = await prisma.generatedDocument.create({
      data: { type: "WORK_CERTIFICATE", status: "REQUESTED", requestedById: ownerUserId },
    });
    docId = doc.id;

    const stranger: DocumentActor = { userId: strangerUserId, role: "MANAGER" };
    expect(await generateWorkCertificate(stranger, docId)).toEqual({ ok: false, reason: "forbidden" });
    expect(await rejectDocumentRequest(stranger, docId, "not my call")).toEqual({
      ok: false,
      reason: "forbidden",
    });

    const row = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(row.status).toBe("REQUESTED");
    expect(row.pdfUrl).toBeNull();
  });
});
