import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  OFFBOARDING_TEMPLATE,
  computeProgress,
  listOffboardingCandidates,
  getOffboardings,
  initiateOffboarding,
  setOffboardingStepStatus,
  completeOffboarding,
} from "@/lib/offboarding";

// SCRUM-096 — the compliant exit workflow. HR-only (employee:manage); completing
// it archives the employee (status → TERMINATED, never a delete) and writes the
// lifecycle to the AuditLog (metadata only).

const HR = { userId: "offb-test-hr", role: "HR_ADMIN" as const };
const cleanup = { users: [] as string[], employees: [] as string[], audits: [] as string[] };

afterAll(async () => {
  // Audit rows written for our test employees, cleaned up by actor.
  await prisma.auditLog.deleteMany({ where: { actorId: HR.userId } });
  if (cleanup.employees.length) {
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
      email: `${name}-${Math.round(performance.now())}@offb.test`,
      name,
      role: "EMPLOYEE",
      passwordHash: "x",
      employee: {
        create: {
          title: "Engineer",
          department: "Eng",
          location: "Remote",
          salary: 120000,
          startDate: new Date("2024-01-01"),
        },
      },
    },
    include: { employee: true },
  });
  cleanup.users.push(user.id);
  cleanup.employees.push(user.employee!.id);
  return user.employee!.id;
}

describe("offboarding — pure helpers + RBAC gating", () => {
  it("computeProgress counts DONE and rounds", () => {
    expect(computeProgress([])).toEqual({ total: 0, done: 0, percent: 0 });
    expect(
      computeProgress([{ status: "DONE" }, { status: "PENDING" }, { status: "PENDING" }]),
    ).toEqual({ total: 3, done: 1, percent: 33 });
  });

  it("only HR (employee:manage) can act; others are blocked", async () => {
    expect(can("EMPLOYEE", "employee:manage")).toBe(false);
    expect(can("MANAGER", "employee:manage")).toBe(false);
    expect(can("HR_ADMIN", "employee:manage")).toBe(true);

    const emp = { userId: "e", role: "EMPLOYEE" as const };
    expect(await listOffboardingCandidates(emp)).toEqual([]);
    expect(await getOffboardings(emp)).toEqual([]);
    expect(
      await initiateOffboarding(emp, {
        employeeId: "x",
        reason: "RESIGNATION",
        lastDay: new Date("2026-08-01"),
      }),
    ).toBe("forbidden");
  });
});

describe("offboarding — full lifecycle + archive + audit", () => {
  it("initiate → step complete → complete archives the employee and logs it", async () => {
    const employeeId = await makeEmployee("Departing");

    // Candidate appears before, and initiation seeds the template.
    const before = await listOffboardingCandidates(HR);
    expect(before.some((c) => c.employeeId === employeeId)).toBe(true);

    expect(
      await initiateOffboarding(HR, {
        employeeId,
        reason: "RESIGNATION",
        lastDay: new Date("2026-08-15"),
      }),
    ).toBe("ok");

    // Second attempt is rejected (one offboarding per employee).
    expect(
      await initiateOffboarding(HR, {
        employeeId,
        reason: "OTHER",
        lastDay: new Date("2026-08-15"),
      }),
    ).toBe("exists");

    // No longer a candidate once offboarding exists.
    const after = await listOffboardingCandidates(HR);
    expect(after.some((c) => c.employeeId === employeeId)).toBe(false);

    const [off] = await getOffboardings(HR, "IN_PROGRESS");
    const mine = (await getOffboardings(HR, "IN_PROGRESS")).find(
      (o) => o.employeeId === employeeId,
    )!;
    expect(off).toBeDefined();
    expect(mine.steps).toHaveLength(OFFBOARDING_TEMPLATE.length);

    // Can't complete while steps remain.
    expect(await completeOffboarding(HR, mine.id)).toBe("incomplete");

    // Tick every step.
    for (const step of mine.steps) {
      expect(await setOffboardingStepStatus(HR, step.id, true)).toBe(true);
    }
    const ticked = (await getOffboardings(HR, "IN_PROGRESS")).find((o) => o.id === mine.id)!;
    expect(ticked.progress.done).toBe(OFFBOARDING_TEMPLATE.length);
    expect(ticked.progress.percent).toBe(100);

    // Complete → archives the employee, moves to COMPLETED.
    expect(await completeOffboarding(HR, mine.id)).toBe("ok");
    expect(await completeOffboarding(HR, mine.id)).toBe("already_done");

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(employee).not.toBeNull(); // archived, NOT deleted
    expect(employee!.status).toBe("TERMINATED");

    const completed = await getOffboardings(HR, "COMPLETED");
    const done = completed.find((o) => o.employeeId === employeeId)!;
    expect(done.state).toBe("COMPLETED");
    expect(done.completedAt).not.toBeNull();

    // Compliance trail: initiation + one-per-step + final archive were recorded.
    const audits = await prisma.auditLog.findMany({
      where: { actorId: HR.userId, targetId: employeeId },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("OFFBOARDING_INITIATED");
    expect(actions).toContain("EMPLOYEE_OFFBOARDED");
    expect(actions.filter((a) => a === "OFFBOARDING_STEP_COMPLETED")).toHaveLength(
      OFFBOARDING_TEMPLATE.length,
    );
    // No-PII: audit rows carry codes/counts only.
    expect(JSON.stringify(audits)).not.toMatch(/salary|password|Departing/i);
  });
});
