// SCRUM-075 — authorization tests for the HR company-wide dashboard (SCRUM-072
// — "activité IA et documents"). 
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import { DEFAULT_ROLE_PERMISSIONS, builtinSubject, can } from "@/lib/rbac";
import { getHrDashboard } from "@/lib/kpi/hr-dashboard";
import type { Caller } from "@/lib/hr";

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

describe("dashboard:read:company permission gate", () => {
  it("only HR_ADMIN / SUPER_ADMIN hold dashboard:read:company", () => {
    expect(can(builtinSubject("EMPLOYEE"), "dashboard:read:company")).toBe(false);
    expect(can(builtinSubject("MANAGER"), "dashboard:read:company")).toBe(false);
    expect(can(builtinSubject("HR_ADMIN"), "dashboard:read:company")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "dashboard:read:company")).toBe(true);
  });
});

describe("getHrDashboard — unauthorized roles", () => {
  it("EMPLOYEE and MANAGER get an empty model, never the company-wide data", async () => {
    for (const actor of [callers.employee, callers.manager]) {
      const model = await getHrDashboard(actor, new Date());
      expect(model.kpis).toEqual([]);
      expect(model.docStatusCounts.all).toBe(0);
      expect(model.refusalRatePct).toBe(0);
    }
  });
});

describe("getHrDashboard — authorized roles see company-wide data", () => {
  it("HR_ADMIN and SUPER_ADMIN see populated KPIs and the document corpus breakdown", async () => {
    for (const key of ["hr", "admin"] as const) {
      const model = await getHrDashboard(callers[key], new Date());
      expect(model.kpis.length).toBeGreaterThan(0);
      // Sprint 2 seeded the HR handbook — the corpus is never empty.
      expect(model.docStatusCounts.all).toBeGreaterThan(0);
    }
  });
});
