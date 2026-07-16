import { describe, it, expect } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, builtinSubject, can } from "@/lib/rbac";
import { getOpenAlerts, getAlerts, reopenAlert, alertDetail } from "@/lib/alerts";

describe("alerts — RBAC gating", () => {
  it("only HR_ADMIN / SUPER_ADMIN hold alerts:read", () => {
    expect(can(builtinSubject("EMPLOYEE"), "alerts:read")).toBe(false);
    expect(can(builtinSubject("MANAGER"), "alerts:read")).toBe(false);
    expect(can(builtinSubject("HR_ADMIN"), "alerts:read")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "alerts:read")).toBe(true);
  });

  // These early-return before touching the database, so they need no Postgres.
  it("read helpers return [] for roles without alerts:read (no DB access)", async () => {
    expect(await getOpenAlerts(builtinSubject("EMPLOYEE"))).toEqual([]);
    expect(await getOpenAlerts(builtinSubject("MANAGER"))).toEqual([]);
    expect(await getAlerts(builtinSubject("EMPLOYEE"))).toEqual([]);
    expect(await getAlerts(builtinSubject("MANAGER"), { status: "OPEN" })).toEqual([]);
  });

  it("triage helpers no-op for roles without alerts:read (no DB access)", async () => {
    expect(await reopenAlert({ role: "EMPLOYEE", permissions: DEFAULT_ROLE_PERMISSIONS["EMPLOYEE"], userId: "u1" }, "any")).toBe(false);
    expect(await reopenAlert({ role: "MANAGER", permissions: DEFAULT_ROLE_PERMISSIONS["MANAGER"], userId: "u1" }, "any")).toBe(false);
  });
});

describe("alerts — alertDetail picks the relevant param per kind", () => {
  it("maps each kind to its display detail (code/count, never PII)", () => {
    expect(alertDetail({ kind: "AI_GUARD_BLOCK", params: { rule: "prompt_injection", role: "EMPLOYEE" } })).toBe(
      "prompt_injection",
    );
    expect(alertDetail({ kind: "AI_REFUSAL", params: { count: 3 } })).toBe("3");
    expect(alertDetail({ kind: "AI_ERROR", params: { code: "rate_limited" } })).toBe("rate_limited");
    expect(alertDetail({ kind: "CONVERSATION_CLOSED", params: { reason: "ABUSE" } })).toBe("ABUSE");
  });

  it("returns null when the param is absent", () => {
    expect(alertDetail({ kind: "AI_REFUSAL", params: null })).toBeNull();
    expect(alertDetail({ kind: "AI_GUARD_BLOCK", params: {} })).toBeNull();
  });
});
