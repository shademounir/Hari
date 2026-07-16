import { describe, it, expect } from "vitest";
import {
  builtinSubject,
  can,
  DEFAULT_ROLE_PERMISSIONS,
  isPermission,
  PERMISSIONS,
  visibleDocTiers,
  type BuiltinRole,
  type Permission,
} from "@/lib/rbac";

// These assert the BUILT-IN DEFAULTS — the matrix this codebase ships with and
// falls back to (a built-in Role row stores permissions = NULL, meaning "use
// these"). The EFFECTIVE matrix is resolved from the database and can be edited
// by a super admin; tests/rbac-config.integration.test.ts covers that resolution.
//
// `can()` takes a resolved Subject rather than a role slug, since roles are data
// now: a slug alone no longer says what it may do. `builtinSubject(role)` is the
// subject a role has before anyone edits it.
const at = (role: BuiltinRole) => builtinSubject(role);

describe("RBAC built-in matrix", () => {
  it("engagement: managers read+rate their team, HR reads all + manages; employees get NOTHING, and there is NO self-read (SCRUM-099)", () => {
    // Employees can never touch engagement.
    expect(can(at("EMPLOYEE"), "engagement:read:team")).toBe(false);
    expect(can(at("EMPLOYEE"), "engagement:input")).toBe(false);
    // Managers: their team + qualitative input, but not company-wide or recalibration.
    expect(can(at("MANAGER"), "engagement:read:team")).toBe(true);
    expect(can(at("MANAGER"), "engagement:input")).toBe(true);
    expect(can(at("MANAGER"), "engagement:read:all")).toBe(false);
    expect(can(at("MANAGER"), "engagement:manage")).toBe(false);
    // HR/Admin: everything.
    expect(can(at("HR_ADMIN"), "engagement:read:all")).toBe(true);
    expect(can(at("HR_ADMIN"), "engagement:manage")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "engagement:read:all")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "engagement:manage")).toBe(true);

    // CRITICAL PRIVACY INVARIANT: `engagement:read:self` must not exist at all —
    // no employee (nor anyone) may read their own engagement score via a permission.
    expect(PERMISSIONS as readonly string[]).not.toContain("engagement:read:self");
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as BuiltinRole[]) {
      expect(DEFAULT_ROLE_PERMISSIONS[role] as string[]).not.toContain("engagement:read:self");
    }
  });

  it("the permission vocabulary is closed: a role config cannot invent a permission", () => {
    // The above invariant used to be guaranteed by the absence of a code path.
    // With a DB-backed matrix an admin edits role→permission mappings, so what
    // now guarantees it is that `isPermission` — the ONE filter every DB-sourced
    // permission list passes through (see lib/rbac-server) — rejects anything the
    // code doesn't enforce. A form cannot smuggle `engagement:read:self` in.
    expect(isPermission("engagement:read:self")).toBe(false);
    expect(isPermission("admin:everything")).toBe(false);
    expect(isPermission("")).toBe(false);
    expect(isPermission(null)).toBe(false);
    expect(isPermission({ toString: () => "handbook:read" })).toBe(false);
    // ...and accepts exactly what it should.
    for (const p of PERMISSIONS) expect(isPermission(p)).toBe(true);
  });

  it("an unknown permission holds nothing, and a subject with no permissions can do nothing", () => {
    const nobody = { role: "GHOST", permissions: [] as Permission[] };
    for (const p of PERMISSIONS) expect(can(nobody, p)).toBe(false);
    // Fail closed: this is what an unresolvable role slug collapses to.
    expect(visibleDocTiers(nobody)).toEqual(["ALL_EMPLOYEES"]);
  });

  it("employees can read the handbook and request leave, but not approve", () => {
    expect(can(at("EMPLOYEE"), "handbook:read")).toBe(true);
    expect(can(at("EMPLOYEE"), "leave:request")).toBe(true);
    expect(can(at("EMPLOYEE"), "leave:approve")).toBe(false);
    expect(can(at("EMPLOYEE"), "directory:read:all")).toBe(false);
    expect(can(at("EMPLOYEE"), "salary:read:all")).toBe(false);
  });

  it("every role may maintain its own profile", () => {
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as BuiltinRole[]) {
      expect(can(at(role), "profile:edit:self")).toBe(true);
    }
  });

  it("managers can approve leave and see their team", () => {
    expect(can(at("MANAGER"), "leave:approve")).toBe(true);
    expect(can(at("MANAGER"), "directory:read:team")).toBe(true);
    expect(can(at("MANAGER"), "directory:read:all")).toBe(false);
    expect(can(at("MANAGER"), "salary:read:all")).toBe(false);
  });

  it("managers hold the team KPI dashboard permission; employees do not (SCRUM-071)", () => {
    expect(can(at("MANAGER"), "dashboard:read:team")).toBe(true);
    expect(can(at("EMPLOYEE"), "dashboard:read:team")).toBe(false);
    // Inherited up the chain, but the dashboard never grants alerts access.
    expect(can(at("HR_ADMIN"), "dashboard:read:team")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "dashboard:read:team")).toBe(true);
    expect(can(at("MANAGER"), "alerts:read")).toBe(false);
  });

  it("only HR/Admin hold the company-wide AI activity + documents dashboard permission (SCRUM-072)", () => {
    expect(can(at("HR_ADMIN"), "dashboard:read:company")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "dashboard:read:company")).toBe(true);
    expect(can(at("MANAGER"), "dashboard:read:company")).toBe(false);
    expect(can(at("EMPLOYEE"), "dashboard:read:company")).toBe(false);
  });

  it("HR can read the whole company, salaries and payslips", () => {
    expect(can(at("HR_ADMIN"), "directory:read:all")).toBe(true);
    expect(can(at("HR_ADMIN"), "salary:read:all")).toBe(true);
    expect(can(at("HR_ADMIN"), "payslip:read:any")).toBe(true);
    expect(can(at("HR_ADMIN"), "admin:settings")).toBe(false);
  });

  it("super admin holds every permission (superset of HR)", () => {
    expect(can(at("SUPER_ADMIN"), "admin:settings")).toBe(true);
    for (const p of DEFAULT_ROLE_PERMISSIONS.HR_ADMIN) {
      expect(can(at("SUPER_ADMIN"), p)).toBe(true);
    }
  });

  it("only HR admins and super admins can manage the knowledge base", () => {
    expect(can(at("EMPLOYEE"), "kb:manage")).toBe(false);
    expect(can(at("MANAGER"), "kb:manage")).toBe(false);
    expect(can(at("HR_ADMIN"), "kb:manage")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "kb:manage")).toBe(true);
  });

  it("departure-risk predictions: managers+ can read; only HR/Admin can recalibrate (SCRUM-098)", () => {
    // read: MANAGER and up (managers see their own team, anonymized downstream).
    expect(can(at("EMPLOYEE"), "predictions:read")).toBe(false);
    expect(can(at("MANAGER"), "predictions:read")).toBe(true);
    expect(can(at("HR_ADMIN"), "predictions:read")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "predictions:read")).toBe(true);
    // manage (recalibration): HR/Admin only — a manager can view but not retune.
    expect(can(at("EMPLOYEE"), "predictions:manage")).toBe(false);
    expect(can(at("MANAGER"), "predictions:manage")).toBe(false);
    expect(can(at("HR_ADMIN"), "predictions:manage")).toBe(true);
    expect(can(at("SUPER_ADMIN"), "predictions:manage")).toBe(true);
  });

  it("KB document visibility tiers are nested by role (HARI-59)", () => {
    expect(visibleDocTiers(at("EMPLOYEE"))).toEqual(["ALL_EMPLOYEES"]);
    expect(visibleDocTiers(at("MANAGER"))).toEqual(["ALL_EMPLOYEES", "MANAGERS"]);
    expect(visibleDocTiers(at("HR_ADMIN"))).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);
    expect(visibleDocTiers(at("SUPER_ADMIN"))).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);
  });

  it("KB tiers follow the DIRECTORY permissions, not the role name", () => {
    // visibleDocTiers derives from directory:read:*, so a custom role that can see
    // the whole company reads HR_ONLY articles even though it isn't HR_ADMIN. This
    // is the least obvious consequence of editing the matrix, and the role editor
    // says so inline; pin it here so the coupling can't change silently.
    const auditor: { role: string; permissions: Permission[] } = {
      role: "AUDITOR",
      permissions: ["directory:read:all"],
    };
    expect(visibleDocTiers(auditor)).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);

    const leadOnly = { role: "LEAD", permissions: ["directory:read:team"] as Permission[] };
    expect(visibleDocTiers(leadOnly)).toEqual(["ALL_EMPLOYEES", "MANAGERS"]);
  });

  it("built-in permissions are strictly nested EMPLOYEE ⊂ MANAGER ⊂ HR_ADMIN ⊂ SUPER_ADMIN", () => {
    // Applies to the SHIPPED DEFAULTS only. It is deliberately no longer a global
    // rule: a custom role (an AUDITOR holding a few permissions nobody else has)
    // breaks containment by design, so the editor treats nesting as advisory
    // rather than enforcing it. What must not drift is the four built-ins.
    const chain = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;
    for (let i = 1; i < chain.length; i++) {
      const lower = new Set(DEFAULT_ROLE_PERMISSIONS[chain[i - 1]]);
      const higher = new Set(DEFAULT_ROLE_PERMISSIONS[chain[i]]);
      for (const p of lower) expect(higher.has(p)).toBe(true);
      expect(higher.size).toBeGreaterThan(lower.size);
    }
  });

  it("every built-in default is a real permission", () => {
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as BuiltinRole[]) {
      for (const p of DEFAULT_ROLE_PERMISSIONS[role]) expect(isPermission(p)).toBe(true);
    }
  });
});
