import { describe, it, expect } from "vitest";
import { can, PERMISSIONS, ROLE_PERMISSIONS, visibleDocTiers } from "@/lib/rbac";

describe("RBAC matrix", () => {
  it("engagement: managers read+rate their team, HR reads all + manages; employees get NOTHING, and there is NO self-read (SCRUM-099)", () => {
    // Employees can never touch engagement.
    expect(can("EMPLOYEE", "engagement:read:team")).toBe(false);
    expect(can("EMPLOYEE", "engagement:input")).toBe(false);
    // Managers: their team + qualitative input, but not company-wide or recalibration.
    expect(can("MANAGER", "engagement:read:team")).toBe(true);
    expect(can("MANAGER", "engagement:input")).toBe(true);
    expect(can("MANAGER", "engagement:read:all")).toBe(false);
    expect(can("MANAGER", "engagement:manage")).toBe(false);
    // HR/Admin: everything.
    expect(can("HR_ADMIN", "engagement:read:all")).toBe(true);
    expect(can("HR_ADMIN", "engagement:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "engagement:read:all")).toBe(true);
    expect(can("SUPER_ADMIN", "engagement:manage")).toBe(true);

    // CRITICAL PRIVACY INVARIANT: `engagement:read:self` must not exist at all —
    // no employee (nor anyone) may read their own engagement score via a permission.
    expect((PERMISSIONS as readonly string[])).not.toContain("engagement:read:self");
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      expect((ROLE_PERMISSIONS[role] as string[])).not.toContain("engagement:read:self");
    }
  });

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

  it("managers hold the team KPI dashboard permission; employees do not (SCRUM-071)", () => {
    expect(can("MANAGER", "dashboard:read:team")).toBe(true);
    expect(can("EMPLOYEE", "dashboard:read:team")).toBe(false);
    // Inherited up the chain, but the dashboard never grants alerts access.
    expect(can("HR_ADMIN", "dashboard:read:team")).toBe(true);
    expect(can("SUPER_ADMIN", "dashboard:read:team")).toBe(true);
    expect(can("MANAGER", "alerts:read")).toBe(false);
  });

  it("only HR/Admin hold the company-wide AI activity + documents dashboard permission (SCRUM-072)", () => {
    expect(can("HR_ADMIN", "dashboard:read:company")).toBe(true);
    expect(can("SUPER_ADMIN", "dashboard:read:company")).toBe(true);
    expect(can("MANAGER", "dashboard:read:company")).toBe(false);
    expect(can("EMPLOYEE", "dashboard:read:company")).toBe(false);
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

  it("departure-risk predictions: managers+ can read; only HR/Admin can recalibrate (SCRUM-098)", () => {
    // read: MANAGER and up (managers see their own team, anonymized downstream).
    expect(can("EMPLOYEE", "predictions:read")).toBe(false);
    expect(can("MANAGER", "predictions:read")).toBe(true);
    expect(can("HR_ADMIN", "predictions:read")).toBe(true);
    expect(can("SUPER_ADMIN", "predictions:read")).toBe(true);
    // manage (recalibration): HR/Admin only — a manager can view but not retune.
    expect(can("EMPLOYEE", "predictions:manage")).toBe(false);
    expect(can("MANAGER", "predictions:manage")).toBe(false);
    expect(can("HR_ADMIN", "predictions:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "predictions:manage")).toBe(true);
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
});
