// SCRUM-081 — pure rendering test for the work-certificate PDF. next-intl/server
// is mocked (same approach as api.chat.test.ts) so the test needs no request
// context; no DB, no MinIO.
import { describe, it, expect, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn(async () => {
    const dict: Record<string, string> = {
      heading: "Work Certificate",
      issuedOn: "Issued on {date}",
      bodyActive:
        "This certifies that {name}, employed as {title} in the {department} department, has been a member of our staff since {startDate} and remains an active employee as of this certificate's issue date.",
      bodyTerminated:
        "This certifies that {name} was employed as {title} in the {department} department from {startDate} to {endDate}.",
      footer: "This document is generated automatically and is valid without a signature.",
    };
    return (key: string, values?: Record<string, string>) => {
      let s = dict[key];
      if (values) for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
      return s;
    };
  }),
}));

const { renderWorkCertificatePdf } = await import("@/lib/pdf/work-certificate");

describe("renderWorkCertificatePdf", () => {
  it("renders a PDF buffer for an active employee", async () => {
    const buf = await renderWorkCertificatePdf({
      employeeName: "Jane Doe",
      title: "Engineer",
      department: "Engineering",
      startDate: new Date("2020-01-01"),
      terminationDate: null,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders a PDF buffer for a former employee without throwing", async () => {
    const buf = await renderWorkCertificatePdf({
      employeeName: "John Smith",
      title: "Analyst",
      department: "Finance",
      startDate: new Date("2018-06-01"),
      terminationDate: new Date("2023-09-30"),
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
