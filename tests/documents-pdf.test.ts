// SCRUM-094 — PDF template rendering. Deterministic: no DB, no network, no
// live model call. Sanity checks only (non-empty buffer, %PDF magic bytes),
// not a visual diff.
import { describe, it, expect } from "vitest";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import type { DocumentProfile } from "@/lib/documents/types";

const profile: DocumentProfile = {
  name: "Jane Doe",
  title: "Software Engineer",
  department: "Engineering",
  managerName: "John Smith",
  startDate: new Date("2021-03-01"),
};

function expectPdf(buffer: Buffer) {
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
}

describe("SCRUM-094 — renderDocumentPdf", () => {
  it("renders WORK_CERTIFICATE", async () => {
    expectPdf(await renderDocumentPdf("WORK_CERTIFICATE", { profile }));
  });

  it("renders LEAVE_CONFIRMATION", async () => {
    expectPdf(
      await renderDocumentPdf("LEAVE_CONFIRMATION", {
        profile,
        leaveType: "VACATION",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-10"),
        days: 8,
      }),
    );
  });

  it("renders MUTATION_LETTER", async () => {
    expectPdf(
      await renderDocumentPdf("MUTATION_LETTER", { profile, effectiveDate: new Date("2026-09-01") }),
    );
  });

  it("renders RECOMMENDATION_LETTER", async () => {
    expectPdf(await renderDocumentPdf("RECOMMENDATION_LETTER", { profile }));
  });

  it("renders HR_SUMMARY with multi-paragraph AI text", async () => {
    expectPdf(
      await renderDocumentPdf("HR_SUMMARY", {
        profile,
        summaryText: "First paragraph about Jane.\n\nSecond paragraph with more detail.",
      }),
    );
  });

  it("renders a document with no manager on file (managerName: null)", async () => {
    expectPdf(
      await renderDocumentPdf("MUTATION_LETTER", {
        profile: { ...profile, managerName: null },
        effectiveDate: new Date(),
      }),
    );
  });
});
