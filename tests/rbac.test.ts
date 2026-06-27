import { describe, it, expect } from "vitest";
import { can, ROLE_PERMISSIONS } from "@/lib/rbac";

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

  it("permissions are strictly nested EMPLOYEE ⊂ MANAGER ⊂ HR_ADMIN ⊂ SUPER_ADMIN", () => {
    const chain = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;
    for (let i = 1; i < chain.length; i++) {
      const lower = new Set(ROLE_PERMISSIONS[chain[i - 1]]);
      const higher = new Set(ROLE_PERMISSIONS[chain[i]]);
      for (const p of lower) expect(higher.has(p)).toBe(true);
      expect(higher.size).toBeGreaterThan(lower.size);
    }
  });
});
