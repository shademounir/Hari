// SCRUM-098 — authorization test for the departure-risk scope predicate.
//
// getPredictionCandidates is the invariant-#5 boundary deciding WHICH employees
// enter the risk board / feed the predictDepartures tool:
//   directory:read:all (HR/Admin) → whole active company
//   directory:read:team (MANAGER) → own direct reports only
//   otherwise (EMPLOYEE)          → none
// A regression widening the manager/else branch would leak company-wide risk with
// no other test failing — this pins it. Needs a seeded DB (npm run db:seed).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac";
import { getPredictionCandidates } from "@/lib/predictive/data-layer";
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

describe("getPredictionCandidates — directory scope", () => {
  it("EMPLOYEE sees no candidates", async () => {
    expect(await getPredictionCandidates(callers.employee)).toEqual([]);
  });

  it("MANAGER sees exactly their own ACTIVE direct reports", async () => {
    const result = await getPredictionCandidates(callers.manager);
    const expected = await prisma.employee.count({
      where: { status: "ACTIVE", managerId: callers.manager.employeeId },
    });
    expect(result.length).toBe(expected);
    expect(result.length).toBeGreaterThan(0); // the seeded manager has reports

    // Every returned candidate is genuinely a direct report of this manager.
    const reportIds = new Set(
      (
        await prisma.employee.findMany({
          where: { managerId: callers.manager.employeeId },
          select: { id: true },
        })
      ).map((e) => e.id),
    );
    for (const c of result) expect(reportIds.has(c.employeeId)).toBe(true);
  });

  it("MANAGER does not see an employee outside their team", async () => {
    const result = await getPredictionCandidates(callers.manager);
    const reportIds = (
      await prisma.employee.findMany({
        where: { managerId: callers.manager.employeeId },
        select: { id: true },
      })
    ).map((e) => e.id);
    // Any ACTIVE employee who is NOT a direct report (Prisma `not` would also drop
    // null-manager rows, so use notIn against the actual report set).
    const outsider = await prisma.employee.findFirst({
      where: { status: "ACTIVE", id: { notIn: reportIds } },
      select: { id: true },
    });
    expect(outsider).not.toBeNull();
    expect(result.some((c) => c.employeeId === outsider!.id)).toBe(false);
  });

  it("HR and SUPER_ADMIN see the whole ACTIVE company", async () => {
    const activeCount = await prisma.employee.count({ where: { status: "ACTIVE" } });
    expect((await getPredictionCandidates(callers.hr)).length).toBe(activeCount);
    expect((await getPredictionCandidates(callers.admin)).length).toBe(activeCount);
  });
});
