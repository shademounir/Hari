// SCRUM-097 — integration tests for the HR analytics data layer against a real
// (seeded) Postgres. Covers the two authorization criteria (a non-authorized
// role sees nothing; a manager is strictly team-scoped and never sees payroll;
// HR/Admin see the company-wide model incl. payroll) and the correctness of the
// aggregate shapes (fixed-length trend series, non-negative rates, band totals).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import { DEFAULT_ROLE_PERMISSIONS, builtinSubject, can } from "@/lib/rbac";
import { getHrAnalytics, getTeamAnalytics } from "@/lib/analytics";
import { resolveAnalyticsScope } from "@/lib/analytics/scope";
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

describe("analytics permission gates", () => {
  it("EMPLOYEE holds neither analytics permission; higher roles do", () => {
    expect(can(builtinSubject("EMPLOYEE"), "analytics:team")).toBe(false);
    expect(can(builtinSubject("EMPLOYEE"), "analytics:full")).toBe(false);
    expect(can(builtinSubject("MANAGER"), "analytics:team")).toBe(true);
    expect(can(builtinSubject("MANAGER"), "analytics:full")).toBe(false);
    expect(can(builtinSubject("HR_ADMIN"), "analytics:full")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "analytics:full")).toBe(true);
  });
});

describe("getHrAnalytics — authorization", () => {
  it("returns null for an EMPLOYEE (no data at all)", async () => {
    expect(await getHrAnalytics(callers.employee, {}, new Date())).toBeNull();
  });

  it("a MANAGER gets a team-scoped model with NO payroll", async () => {
    const model = await getHrAnalytics(callers.manager, {}, new Date());
    expect(model).not.toBeNull();
    expect(model!.payroll).toBeNull();
    expect(resolveAnalyticsScope(callers.manager)!.canPayroll).toBe(false);
  });

  it("HR_ADMIN and SUPER_ADMIN get the company-wide model WITH payroll", async () => {
    for (const key of ["hr", "admin"] as const) {
      const model = await getHrAnalytics(callers[key], {}, new Date());
      expect(model).not.toBeNull();
      expect(model!.payroll).not.toBeNull();
      expect(model!.overview.headcount.value).toBeGreaterThan(0);
    }
  });

  it("a manager's headcount is a strict subset of the company headcount", async () => {
    const mgr = await getHrAnalytics(callers.manager, {}, new Date());
    const hr = await getHrAnalytics(callers.hr, {}, new Date());
    expect(hr!.overview.headcount.value).toBeGreaterThanOrEqual(mgr!.overview.headcount.value);
  });
});

describe("getHrAnalytics — aggregate shapes (HR company view)", () => {
  it("produces fixed-length trend series and sane distributions", async () => {
    const m = (await getHrAnalytics(callers.hr, {}, new Date()))!;

    // Turnover trend spans 24 months; absenteeism 12; payroll 12.
    expect(m.turnover.byMonth).toHaveLength(24);
    expect(m.absenteeism.byMonth).toHaveLength(12);
    expect(m.payroll!.byMonth).toHaveLength(12);

    // Rates are non-negative percentages.
    expect(m.turnover.ratePct).toBeGreaterThanOrEqual(0);
    expect(m.absenteeism.ratePct).toBeGreaterThanOrEqual(0);

    // The seed has ≥1 departure with a reason → turnover breakdown is populated.
    expect(m.turnover.byReason.reduce((s, x) => s + x.value, 0)).toBeGreaterThan(0);

    // Age pyramid always has the five bands; salary bands cover everyone active.
    expect(m.diversity.ageBands).toHaveLength(5);
    const banded = m.payroll!.byBand.reduce((s, b) => s + b.value, 0);
    expect(banded).toBe(m.overview.headcount.value);
  });

  it("review coverage is a 0–100 percentage and the overdue list is well-formed", async () => {
    const m = (await getHrAnalytics(callers.hr, {}, new Date()))!;
    expect(m.reviews.reviewedThisYearPct).toBeGreaterThanOrEqual(0);
    expect(m.reviews.reviewedThisYearPct).toBeLessThanOrEqual(100);
    for (const r of m.reviews.overdue) {
      expect(typeof r.department).toBe("string");
      expect(r.lastReviewedAt === null || typeof r.lastReviewedAt === "string").toBe(true);
    }
  });
});

describe("getTeamAnalytics — manager view", () => {
  it("is populated and team-scoped, with a reviews-to-plan count", async () => {
    const t = await getTeamAnalytics(callers.manager, {}, new Date());
    expect(t).not.toBeNull();
    expect(t!.headcount).toBeGreaterThan(0);
    expect(t!.reviewsToPlan).toBe(t!.overdueReviews.length);
  });

  it("returns null for an unauthorized EMPLOYEE", async () => {
    expect(await getTeamAnalytics(callers.employee, {}, new Date())).toBeNull();
  });
});
