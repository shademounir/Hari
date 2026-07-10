// SCRUM-094 — pure workflow/authorization rules for GeneratedDocument.
// 100% deterministic: no DB, no network. See src/lib/documents/rules.ts.
import { describe, it, expect } from "vitest";
import { canRequestType, canValidateType, requiresValidation } from "@/lib/documents/rules";

describe("SCRUM-094 — requiresValidation", () => {
  it("WORK_CERTIFICATE, MUTATION_LETTER, RECOMMENDATION_LETTER require a human validator", () => {
    expect(requiresValidation("WORK_CERTIFICATE")).toBe(true);
    expect(requiresValidation("MUTATION_LETTER")).toBe(true);
    expect(requiresValidation("RECOMMENDATION_LETTER")).toBe(true);
  });

  it("LEAVE_CONFIRMATION and HR_SUMMARY never wait on a human validator", () => {
    expect(requiresValidation("LEAVE_CONFIRMATION")).toBe(false);
    expect(requiresValidation("HR_SUMMARY")).toBe(false);
  });
});

describe("SCRUM-094 — canRequestType", () => {
  it("EMPLOYEE can request self-service types for themselves", () => {
    for (const type of ["WORK_CERTIFICATE", "LEAVE_CONFIRMATION", "RECOMMENDATION_LETTER", "HR_SUMMARY"] as const) {
      expect(canRequestType({ role: "EMPLOYEE" }, type, { isSelf: true, reportsToActor: false })).toBe(true);
    }
  });

  it("EMPLOYEE cannot request a self-service type for someone else", () => {
    expect(
      canRequestType({ role: "EMPLOYEE" }, "WORK_CERTIFICATE", { isSelf: false, reportsToActor: false }),
    ).toBe(false);
  });

  it("EMPLOYEE cannot request MUTATION_LETTER at all (never self-service)", () => {
    expect(
      canRequestType({ role: "EMPLOYEE" }, "MUTATION_LETTER", { isSelf: true, reportsToActor: false }),
    ).toBe(false);
    expect(
      canRequestType({ role: "EMPLOYEE" }, "MUTATION_LETTER", { isSelf: false, reportsToActor: false }),
    ).toBe(false);
  });

  it("MANAGER can request MUTATION_LETTER for a direct report, not for a stranger", () => {
    expect(
      canRequestType({ role: "MANAGER" }, "MUTATION_LETTER", { isSelf: false, reportsToActor: true }),
    ).toBe(true);
    expect(
      canRequestType({ role: "MANAGER" }, "MUTATION_LETTER", { isSelf: false, reportsToActor: false }),
    ).toBe(false);
  });

  it("MANAGER cannot request MUTATION_LETTER about themselves", () => {
    expect(
      canRequestType({ role: "MANAGER" }, "MUTATION_LETTER", { isSelf: true, reportsToActor: false }),
    ).toBe(false);
  });

  it("HR_ADMIN / SUPER_ADMIN can request any type for anyone", () => {
    for (const role of ["HR_ADMIN", "SUPER_ADMIN"] as const) {
      expect(canRequestType({ role }, "MUTATION_LETTER", { isSelf: false, reportsToActor: false })).toBe(true);
      expect(canRequestType({ role }, "WORK_CERTIFICATE", { isSelf: false, reportsToActor: false })).toBe(true);
    }
  });
});

describe("SCRUM-094 — canValidateType", () => {
  it("EMPLOYEE never holds documents:validate", () => {
    expect(canValidateType({ role: "EMPLOYEE" }, "MUTATION_LETTER", true)).toBe(false);
  });

  it("MANAGER may validate MUTATION_LETTER only for their own report", () => {
    expect(canValidateType({ role: "MANAGER" }, "MUTATION_LETTER", true)).toBe(true);
    expect(canValidateType({ role: "MANAGER" }, "MUTATION_LETTER", false)).toBe(false);
  });

  it("MANAGER can never validate WORK_CERTIFICATE or RECOMMENDATION_LETTER, even for their own report", () => {
    expect(canValidateType({ role: "MANAGER" }, "WORK_CERTIFICATE", true)).toBe(false);
    expect(canValidateType({ role: "MANAGER" }, "RECOMMENDATION_LETTER", true)).toBe(false);
  });

  it("HR_ADMIN / SUPER_ADMIN can validate any type regardless of management chain", () => {
    for (const role of ["HR_ADMIN", "SUPER_ADMIN"] as const) {
      for (const type of ["WORK_CERTIFICATE", "MUTATION_LETTER", "RECOMMENDATION_LETTER"] as const) {
        expect(canValidateType({ role }, type, false)).toBe(true);
      }
    }
  });
});
