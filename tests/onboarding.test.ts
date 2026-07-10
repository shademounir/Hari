import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  ONBOARDING_TEMPLATE,
  computeProgress,
  getMyOnboarding,
  setMyOnboardingStatus,
  getOnboardingOverview,
} from "@/lib/onboarding";

// SCRUM-095 — the onboarding checklist. Everyone sees + ticks their OWN steps;
// the HR overview is gated on `directory:read:all` (HR / Super Admin).

const cleanup: { users: string[]; employees: string[] } = { users: [], employees: [] };
afterAll(async () => {
  if (cleanup.employees.length) {
    // OnboardingTask cascades on employee delete.
    await prisma.employee.deleteMany({ where: { id: { in: cleanup.employees } } });
  }
  if (cleanup.users.length) {
    await prisma.user.deleteMany({ where: { id: { in: cleanup.users } } });
  }
  await prisma.$disconnect();
});

async function makeEmployee(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${name}-${Math.round(performance.now())}@onboarding.test`,
      name,
      role: "EMPLOYEE",
      passwordHash: "x",
      employee: {
        create: {
          title: "Tester",
          department: "QA",
          location: "Remote",
          salary: 100000,
          startDate: new Date("2026-01-01"),
        },
      },
    },
    include: { employee: true },
  });
  cleanup.users.push(user.id);
  cleanup.employees.push(user.employee!.id);
  return user.employee!.id;
}

describe("onboarding — pure helpers", () => {
  it("computeProgress counts DONE and rounds the percentage", () => {
    expect(computeProgress([])).toEqual({ total: 0, done: 0, percent: 100 });
    expect(
      computeProgress([{ status: "DONE" }, { status: "PENDING" }, { status: "PENDING" }]),
    ).toEqual({ total: 3, done: 1, percent: 33 });
    expect(computeProgress([{ status: "DONE" }, { status: "DONE" }])).toEqual({
      total: 2,
      done: 2,
      percent: 100,
    });
  });
});

describe("onboarding — RBAC gating (no DB access)", () => {
  it("only HR_ADMIN / SUPER_ADMIN can read the company overview", () => {
    expect(can("EMPLOYEE", "directory:read:all")).toBe(false);
    expect(can("MANAGER", "directory:read:all")).toBe(false);
    expect(can("HR_ADMIN", "directory:read:all")).toBe(true);
    expect(can("SUPER_ADMIN", "directory:read:all")).toBe(true);
  });

  it("getOnboardingOverview returns [] for roles without directory:read:all", async () => {
    expect(await getOnboardingOverview({ role: "EMPLOYEE", employeeId: null })).toEqual([]);
    expect(await getOnboardingOverview({ role: "MANAGER", employeeId: null })).toEqual([]);
  });
});

describe("onboarding — checklist lifecycle (metadata only)", () => {
  it("seeds the template on first read and is idempotent", async () => {
    const employeeId = await makeEmployee("Onboardee");
    const first = await getMyOnboarding(employeeId);
    expect(first).toHaveLength(ONBOARDING_TEMPLATE.length);
    expect(first.every((t) => t.status === "PENDING")).toBe(true);
    // A second read must not duplicate the tasks.
    const second = await getMyOnboarding(employeeId);
    expect(second).toHaveLength(ONBOARDING_TEMPLATE.length);
  });

  it("owner can toggle a step; a non-owner id cannot", async () => {
    const employeeId = await makeEmployee("Owner");
    const otherId = await makeEmployee("Stranger");
    const [task] = await getMyOnboarding(employeeId);

    expect(await setMyOnboardingStatus(employeeId, task.id, "DONE")).toBe(true);
    const after = await getMyOnboarding(employeeId);
    const toggled = after.find((t) => t.id === task.id)!;
    expect(toggled.status).toBe("DONE");
    expect(toggled.completedAt).not.toBeNull();
    expect(computeProgress(after).done).toBe(1);

    // A different employee cannot touch this task.
    expect(await setMyOnboardingStatus(otherId, task.id, "PENDING")).toBe(false);
    // Un-tick clears completedAt.
    expect(await setMyOnboardingStatus(employeeId, task.id, "PENDING")).toBe(true);
    const reverted = (await getMyOnboarding(employeeId)).find((t) => t.id === task.id)!;
    expect(reverted.status).toBe("PENDING");
    expect(reverted.completedAt).toBeNull();
  });

  it("HR overview reports per-employee progress", async () => {
    const employeeId = await makeEmployee("Visible");
    const tasks = await getMyOnboarding(employeeId);
    await setMyOnboardingStatus(employeeId, tasks[0].id, "DONE");

    const overview = await getOnboardingOverview({ role: "HR_ADMIN", employeeId: null });
    const row = overview.find((r) => r.employeeId === employeeId);
    expect(row).toBeDefined();
    expect(row!.progress.total).toBe(ONBOARDING_TEMPLATE.length);
    expect(row!.progress.done).toBeGreaterThanOrEqual(1);
    // No-PII contract: overview rows carry name/title/department + counts, never salary.
    expect(JSON.stringify(row)).not.toMatch(/salary|password/i);
  });
});
