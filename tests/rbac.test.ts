import { describe, it, expect } from "vitest";
import { can, canAll, canAny, getPermissions, ROLE_PERMISSIONS, visibleDocTiers } from "@/lib/rbac";

describe("RBAC matrix", () => {
  it("employees can read the handbook and request leave, but not approve", () => {
    expect(can("EMPLOYEE", "handbook:read")).toBe(true);
    expect(can("EMPLOYEE", "leave:request")).toBe(true);
    expect(can("EMPLOYEE", "leave:approve")).toBe(false);
    expect(can("EMPLOYEE", "directory:read:all")).toBe(false);
    expect(can("EMPLOYEE", "salary:read:all")).toBe(false);
  });

  it("managers can approve leave and see their team", () => {
    expect(can("MANAGER", "leave:approve")).toBe(true);
    expect(can("MANAGER", "directory:read:team")).toBe(true);
    expect(can("MANAGER", "directory:read:all")).toBe(false);
    expect(can("MANAGER", "salary:read:all")).toBe(false);
  });

  it("HR can read the whole company, salaries and payslips", () => {
    expect(can("HR_ADMIN", "directory:read:all")).toBe(true);
    expect(can("HR_ADMIN", "salary:read:all")).toBe(true);
    expect(can("HR_ADMIN", "payslip:read:any")).toBe(true);
    expect(can("HR_ADMIN", "admin:settings")).toBe(false);
  });

  it("super admin holds every permission (superset of HR)", () => {
    expect(can("SUPER_ADMIN", "admin:settings")).toBe(true);
    for (const p of ROLE_PERMISSIONS.HR_ADMIN) {
      expect(can("SUPER_ADMIN", p)).toBe(true);
    }
  });

  it("only HR admins and super admins can manage the knowledge base", () => {
    expect(can("EMPLOYEE", "kb:manage")).toBe(false);
    expect(can("MANAGER", "kb:manage")).toBe(false);
    expect(can("HR_ADMIN", "kb:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "kb:manage")).toBe(true);
  });

  it("KB document visibility tiers are nested by role (HARI-59)", () => {
    expect(visibleDocTiers("EMPLOYEE")).toEqual(["ALL_EMPLOYEES"]);
    expect(visibleDocTiers("MANAGER")).toEqual(["ALL_EMPLOYEES", "MANAGERS"]);
    expect(visibleDocTiers("HR_ADMIN")).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);
    expect(visibleDocTiers("SUPER_ADMIN")).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);
  });

  it("permissions are strictly nested EMPLOYEE ⊂ MANAGER ⊂ HR_ADMIN ⊂ SUPER_ADMIN", () => {
    const chain = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;
    for (let i = 1; i < chain.length; i++) {
      const lower = new Set(ROLE_PERMISSIONS[chain[i - 1]]);
      const higher = new Set(ROLE_PERMISSIONS[chain[i]]);
      for (const p of lower) expect(higher.has(p)).toBe(true);
      expect(higher.size).toBeGreaterThan(lower.size);
    }
  });

  // SCRUM-039 — permissions centralisées de la matrice MVP HARI.
  it("employees can request and download their own work certificate, not manage HR documents", () => {
    expect(can("EMPLOYEE", "document:read")).toBe(true);
    expect(can("EMPLOYEE", "document:manage")).toBe(false);
    expect(can("EMPLOYEE", "attestation:request")).toBe(true);
    expect(can("EMPLOYEE", "attestation:download:self")).toBe(true);
    expect(can("EMPLOYEE", "attestation:generate")).toBe(false);
    expect(can("EMPLOYEE", "attestation:download:any")).toBe(false);
  });

  it("HR admins manage documents and generate/download any work certificate", () => {
    expect(can("HR_ADMIN", "document:manage")).toBe(true);
    expect(can("HR_ADMIN", "attestation:generate")).toBe(true);
    expect(can("HR_ADMIN", "attestation:download:any")).toBe(true);
  });

  it("only super admins read/manage AI alerts and read audit logs", () => {
    expect(can("HR_ADMIN", "alert:read")).toBe(false);
    expect(can("HR_ADMIN", "logs:read")).toBe(false);
    expect(can("SUPER_ADMIN", "alert:read")).toBe(true);
    expect(can("SUPER_ADMIN", "alert:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "logs:read")).toBe(true);
  });

  it("canAll / canAny / getPermissions behave as expected", () => {
    expect(canAll("HR_ADMIN", ["directory:read:all", "salary:read:all"])).toBe(true);
    expect(canAll("MANAGER", ["directory:read:team", "salary:read:all"])).toBe(false);
    expect(canAny("EMPLOYEE", ["salary:read:all", "handbook:read"])).toBe(true);
    expect(canAny("EMPLOYEE", ["salary:read:all", "admin:settings"])).toBe(false);
    expect(getPermissions("EMPLOYEE")).toContain("handbook:read");
    expect(getPermissions("EMPLOYEE")).not.toContain("admin:settings");
  });
});
