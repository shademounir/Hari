import { describe, it, expect } from "vitest";
import { can } from "@/lib/rbac";
import { getAuditLogs } from "@/lib/audit";

describe("audit trail — RBAC gating (SCRUM-064)", () => {
  it("audit:read is held only by SUPER_ADMIN — stricter perimeter than alerts:read", () => {
    expect(can("EMPLOYEE", "audit:read")).toBe(false);
    expect(can("MANAGER", "audit:read")).toBe(false);
    expect(can("HR_ADMIN", "audit:read")).toBe(false);
    expect(can("SUPER_ADMIN", "audit:read")).toBe(true);
  });

  // Early-returns before touching the database, so no Postgres needed here.
  it("getAuditLogs returns [] for roles without audit:read (no DB access)", async () => {
    expect(await getAuditLogs({ role: "EMPLOYEE" })).toEqual([]);
    expect(await getAuditLogs({ role: "MANAGER" })).toEqual([]);
    expect(await getAuditLogs({ role: "HR_ADMIN" })).toEqual([]);
  });
});
