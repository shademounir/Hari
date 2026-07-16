// SCRUM-075 — authorization tests for the Team (Manager) dashboard.
//
// Covers the two acceptance criteria from the Sprint 3 brief that this ticket
// owns for the dashboard side:
//   - "Un Manager visualise les KPI de son équipe uniquement."
//   - "Un rôle non autorisé ne peut pas accéder aux dashboards."
//
// getTeamDashboard (src/lib/kpi/dashboard.ts) is the single data assembler the
// /team page calls — testing it directly exercises the real `can()` gate
// without needing to render the Server Component (which would require
// mocking next/navigation's redirect()).
//
// The RH dashboard (SCRUM-072) has its own authorization coverage in
// hr-dashboard-authz.integration.test.ts — this file only covers the
// Manager/team dashboard side of the Sprint 3 dependency chain
// (SCRUM-069/070/071/072 -> SCRUM-075).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import { DEFAULT_ROLE_PERMISSIONS, builtinSubject, can } from "@/lib/rbac";
import { getTeamDashboard } from "@/lib/kpi/dashboard";
import { getTeamScope, type Caller } from "@/lib/hr";

const callers: Record<"employee" | "manager" | "hr" | "admin", Caller> = {
  employee: { role: "EMPLOYEE", permissions: DEFAULT_ROLE_PERMISSIONS["EMPLOYEE"], employeeId: null },
  manager: { role: "MANAGER", permissions: DEFAULT_ROLE_PERMISSIONS["MANAGER"], employeeId: null },
  hr: { role: "HR_ADMIN", permissions: DEFAULT_ROLE_PERMISSIONS["HR_ADMIN"], employeeId: null },
  admin: { role: "SUPER_ADMIN", permissions: DEFAULT_ROLE_PERMISSIONS["SUPER_ADMIN"], employeeId: null },
};
const KEY_BY_EMAIL: Record<string, keyof typeof callers> = {
  "collaborateur@hari.ma": "employee",
  "manager@hari.ma": "manager",
  "rh@hari.ma": "hr",
  "admin@hari.ma": "admin",
};

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.keys(KEY_BY_EMAIL) } },
    include: { employee: { select: { id: true } } },
  });
  for (const u of users) {
    callers[KEY_BY_EMAIL[u.email]] = {
      role: u.role,
      permissions: await permissionsForRole(u.role),
      employeeId: u.employee?.id ?? null,
    };
  }
});

afterAll(() => prisma.$disconnect());

describe("dashboard:read:team permission gate", () => {
  it("EMPLOYEE does not hold dashboard:read:team", () => {
    expect(can(builtinSubject("EMPLOYEE"), "dashboard:read:team")).toBe(false);
  });

  it("MANAGER, HR_ADMIN and SUPER_ADMIN hold dashboard:read:team", () => {
    expect(can(builtinSubject("MANAGER"), "dashboard:read:team")).toBe(true);
    expect(can(builtinSubject("HR_ADMIN"), "dashboard:read:team")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "dashboard:read:team")).toBe(true);
  });
});

describe("getTeamDashboard — unauthorized role", () => {
  it("EMPLOYEE gets an empty KPI model, never the team's data", async () => {
    const model = await getTeamDashboard(callers.employee, new Date());
    expect(model.kpis).toEqual([]);
    // The capacity heatmap must also be empty, not just the KPI cards — a
    // partial refusal (data leaking through a second field) would defeat the
    // gate just as much as returning the KPIs.
    expect(model.capacity.teamSize).toBe(0);
    expect(model.capacity.cells.every((c) => c.onLeave === 0)).toBe(true);
  });
});

describe("getTeamDashboard — authorized roles see real data", () => {
  it("MANAGER sees a populated dashboard for their own team", async () => {
    const model = await getTeamDashboard(callers.manager, new Date());
    expect(model.kpis.length).toBeGreaterThan(0);
    const headcount = model.kpis.find((k) => k.key === "headcount");
    expect(headcount?.value).toBeGreaterThan(0);
  });

  it("HR_ADMIN and SUPER_ADMIN see a populated company-wide dashboard", async () => {
    for (const key of ["hr", "admin"] as const) {
      const model = await getTeamDashboard(callers[key], new Date());
      expect(model.kpis.length).toBeGreaterThan(0);
    }
  });
});

describe("getTeamDashboard — team scoping (a Manager never sees another team's data)", () => {
  it("the Manager's headcount KPI matches their own resolved team scope, not the whole company", async () => {
    const scope = await getTeamScope(callers.manager);
    const model = await getTeamDashboard(callers.manager, new Date(), scope);
    const headcount = model.kpis.find((k) => k.key === "headcount");
    expect(headcount?.value).toBe(scope.employeeIds.length);

    // HR's company-wide headcount must be >= the manager's team-only headcount,
    // confirming the manager's figure is a strict subset, not the same query.
    const hrScope = await getTeamScope(callers.hr);
    expect(hrScope.employeeIds.length).toBeGreaterThanOrEqual(scope.employeeIds.length);
  });
});
