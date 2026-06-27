import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildHrTools, toolsForRole, type ToolCaller } from "@/lib/ai/tools";

// Minimal ToolCallOptions stub for invoking tool.execute directly.
const OPTS = { toolCallId: "test", messages: [] } as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call(t: any, input: unknown) {
  return t.execute(input, OPTS);
}

const callers: Record<string, ToolCaller> = {};

// Demo emails → the stable fixture keys used throughout this file. Keeping the
// map explicit (rather than deriving keys from the email local-part) means a
// future email rename is a one-line change here, not a silent miss.
const CALLER_KEY_BY_EMAIL: Record<string, "employee" | "manager" | "hr"> = {
  "collaborateur@hari.ma": "employee",
  "manager@hari.ma": "manager",
  "rh@hari.ma": "hr",
};

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.keys(CALLER_KEY_BY_EMAIL) } },
    include: { employee: { select: { id: true } } },
  });
  for (const u of users) {
    callers[CALLER_KEY_BY_EMAIL[u.email]] = {
      role: u.role,
      employeeId: u.employee!.id,
      name: u.name,
    };
  }
});

afterAll(() => prisma.$disconnect());

describe("getEmployeeDirectory — role scoping", () => {
  it("employee sees only themselves, with salary hidden", async () => {
    const tools = buildHrTools(callers.employee);
    const out = await call(tools.getEmployeeDirectory, {});
    expect(out.count).toBe(1);
    expect(out.people[0].isSelf).toBe(true);
    expect(out.people[0].salary).toBeNull();
  });

  it("manager sees self + direct reports (active roster), salary still hidden", async () => {
    const tools = buildHrTools(callers.manager);
    const out = await call(tools.getEmployeeDirectory, {});
    // Karim + 7 reports, minus the 2 TERMINATED (hidden by default) = 6.
    expect(out.count).toBe(6);
    expect(out.people.every((p: { salary: number | null }) => p.salary === null)).toBe(true);
    // TERMINATED employees are excluded from the default directory.
    expect(out.people.some((p: { status: string }) => p.status === "TERMINATED")).toBe(false);
  });

  it("HR sees the whole company (active roster) with salaries visible", async () => {
    const tools = buildHrTools(callers.hr);
    const out = await call(tools.getEmployeeDirectory, {});
    // 10 seeded employees, minus the 2 TERMINATED = 8.
    expect(out.count).toBe(8);
    expect(out.people.some((p: { salary: number | null }) => typeof p.salary === "number")).toBe(true);
    expect(out.people.some((p: { status: string }) => p.status === "TERMINATED")).toBe(false);
  });
});

describe("getPayslip — self vs anyone", () => {
  it("employee can view their own payslip", async () => {
    const tools = buildHrTools(callers.employee);
    const out = await call(tools.getPayslip, {});
    expect(out.payslip).toBeDefined();
    expect(out.payslip.netMonthly).toBeGreaterThan(0);
  });

  it("employee's payslip tool is self-only — a passed id is ignored, never returns another's", async () => {
    // The non-elevated tool has no employeeId field at all, and its execute
    // ignores any id, so the agent can't even express a cross-person query.
    const tools = buildHrTools(callers.employee);
    const out = await call(tools.getPayslip, { employeeId: callers.manager.employeeId });
    expect(out.payslip?.employeeName).toContain("Imane"); // own, not Karim
    expect(out.payslip?.employeeName).not.toContain("Karim");
  });

  it("HR can view anyone's payslip by id", async () => {
    const tools = buildHrTools(callers.hr);
    const out = await call(tools.getPayslip, { employeeId: callers.employee.employeeId });
    expect(out.payslip?.employeeName).toContain("Imane");
  });

  it("a guessed / non-existent id yields a clean not-found, never a payslip", async () => {
    // Even with payslip:read:any, an id outside the caller's directory scope
    // (here: one that doesn't exist) must resolve to nothing — no leak, no throw.
    const tools = buildHrTools(callers.hr);
    const out = await call(tools.getPayslip, { employeeId: "clx0000000000000guessed0" });
    expect(out.payslip).toBeUndefined();
    expect(out.refused).toBe(true); // silent, model-only — not rendered
  });
});

describe("approvals — per-role exposure", () => {
  it("employee is NOT offered the approval tools at all", () => {
    const tools = buildHrTools(callers.employee);
    // Out-of-scope tools aren't injected, so the model can't even attempt them.
    expect(tools.listPendingApprovals).toBeUndefined();
    expect(tools.approveLeave).toBeUndefined();
  });

  it("manager sees pending approvals for their reports", async () => {
    const tools = buildHrTools(callers.manager);
    const out = await call(tools.listPendingApprovals, {});
    expect(out.count).toBeGreaterThanOrEqual(2); // Imane + Amina seeded
    const names = out.pending.map((p: { employeeName: string }) => p.employeeName);
    expect(names).toContain("Imane Chraibi");
  });

  it("manager approving a request from outside their team gets a clean error, no data change", async () => {
    // Nadia (HR) does not report to Karim. Even though Karim IS offered approveLeave,
    // a requestId pointing outside his reports is refused server-side and returns a
    // plain { error } — not a denied card — and changes nothing.
    const foreign = await prisma.leaveRequest.create({
      data: {
        employeeId: callers.hr.employeeId!,
        type: "VACATION",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-02"),
        days: 2,
        status: "PENDING",
      },
    });
    try {
      const tools = buildHrTools(callers.manager);
      const out = await call(tools.approveLeave, {
        requestId: foreign.id,
        decision: "APPROVE",
      });
      expect(out.refused).toBe(true); // silent refusal, not a rendered error
      expect(out.result).toBeUndefined();
      // And it must NOT have been approved as a side effect.
      const after = await prisma.leaveRequest.findUnique({ where: { id: foreign.id } });
      expect(after?.status).toBe("PENDING");
    } finally {
      await prisma.leaveRequest.delete({ where: { id: foreign.id } });
    }
  });
});

describe("tool input schemas — tolerant of model quirks", () => {
  it("accepts lowercase enum values (case-insensitive)", () => {
    const tools = buildHrTools(callers.employee);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = (tools.requestTimeOff as any).inputSchema.parse({
      type: "vacation",
      startDate: "2026-09-01",
      endDate: "2026-09-02",
    });
    expect(parsed.type).toBe("VACATION");
  });

  it("accepts null for optional fields (not just undefined)", () => {
    // HR's payslip tool carries the optional employeeId target (employees' doesn't).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => (buildHrTools(callers.hr).getPayslip as any).inputSchema.parse({ employeeId: null })).not.toThrow();
    const tools = buildHrTools(callers.employee);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => (tools.getEmployeeDirectory as any).inputSchema.parse({ filter: null })).not.toThrow();
  });

  it("an employee's payslip tool exposes no employeeId target at all", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (buildHrTools(callers.employee).getPayslip as any).inputSchema.shape;
    expect(shape.employeeId).toBeUndefined();
  });
});

describe("requestTimeOff — write path", () => {
  it("employee can submit a request; days are computed and status is PENDING", async () => {
    const tools = buildHrTools(callers.employee);
    const out = await call(tools.requestTimeOff, {
      type: "VACATION",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
    });
    expect(out.request.status).toBe("PENDING");
    expect(out.request.days).toBe(3);

    // Cleanup so re-runs stay deterministic.
    await prisma.leaveRequest.delete({ where: { id: out.request.id } });
  });

  it("rejects reversed or malformed dates instead of silently recording 1 day", async () => {
    const tools = buildHrTools(callers.employee);
    const reversed = await call(tools.requestTimeOff, {
      type: "VACATION",
      startDate: "2026-09-05",
      endDate: "2026-09-01",
    });
    expect(reversed.error).toMatch(/on or after/i);
    expect(reversed.request).toBeUndefined();

    const malformed = await call(tools.requestTimeOff, {
      type: "VACATION",
      startDate: "next monday",
      endDate: "2026-09-01",
    });
    expect(malformed.error).toMatch(/YYYY-MM-DD/);

    // An impossible day (June has 30 days) must be rejected, not silently
    // rolled forward to July 1.
    const impossible = await call(tools.requestTimeOff, {
      type: "VACATION",
      startDate: "2026-06-31",
      endDate: "2026-07-02",
    });
    expect(impossible.error).toBeDefined();
    expect(impossible.request).toBeUndefined();
  });
});

describe("approveLeave — only acts on PENDING", () => {
  it("refuses to re-process an already-decided request (no double deduction)", async () => {
    const decided = await prisma.leaveRequest.findFirst({
      where: { status: "APPROVED" },
    });
    expect(decided).not.toBeNull();
    const tools = buildHrTools(callers.hr); // company-wide approver
    const out = await call(tools.approveLeave, {
      requestId: decided!.id,
      decision: "APPROVE",
    });
    expect(out.error).toMatch(/already approved/i);
    expect(out.result).toBeUndefined();
  });
});

describe("tool catalogue — irrelevant tools aren't injected per role", () => {
  it("employee gets only self-service tools (no approvals)", () => {
    const tools = buildHrTools(callers.employee);
    expect(Object.keys(tools).sort()).toEqual(
      [
        "getCurrentDateTime", // utilities, always available
        "getDateInfo",
        "businessDaysBetween",
        "getEmployeeDirectory",
        "getLeaveBalance",
        "getPayslip",
        "requestTimeOff",
        "searchHandbook",
      ].sort(),
    );
  });

  it("the calendar utilities are offered to every role", () => {
    for (const c of [callers.employee, callers.manager, callers.hr]) {
      const names = Object.keys(buildHrTools(c));
      expect(names).toContain("getCurrentDateTime");
      expect(names).toContain("getDateInfo");
      expect(names).toContain("businessDaysBetween");
    }
  });

  it("manager additionally gets the approval tools", () => {
    const names = Object.keys(buildHrTools(callers.manager));
    expect(names).toContain("listPendingApprovals");
    expect(names).toContain("approveLeave");
  });

  it("toolsForRole matches what buildHrTools actually exposes", () => {
    for (const c of [callers.employee, callers.manager, callers.hr]) {
      expect(toolsForRole(c.role).sort()).toEqual(Object.keys(buildHrTools(c)).sort());
    }
  });
});

describe("calendar utilities — deterministic date math", () => {
  it("getDateInfo returns the correct weekday and weekend flag", async () => {
    const tools = buildHrTools(callers.employee);
    const tue = await call(tools.getDateInfo, { date: "2026-06-23" });
    expect(tue.weekday).toBe("Tuesday");
    expect(tue.isWeekend).toBe(false);
    const sat = await call(tools.getDateInfo, { date: "2026-06-27" });
    expect(sat.weekday).toBe("Saturday");
    expect(sat.isWeekend).toBe(true);
  });

  it("getDateInfo rejects a malformed or impossible date instead of guessing", async () => {
    const tools = buildHrTools(callers.employee);
    for (const date of ["next monday", "2026-06-31", "2026-02-30", "2026-13-01"]) {
      const out = await call(tools.getDateInfo, { date });
      expect(out.error, `expected ${date} to be rejected`).toBeDefined();
      expect(out.weekday).toBeUndefined();
    }
  });

  it("businessDaysBetween counts Mon–Fri inclusively, ignoring weekends", async () => {
    const tools = buildHrTools(callers.employee);
    // Tue 2026-06-23 → Mon 2026-06-29: 7 calendar days, 5 working (Tue–Fri + Mon).
    const out = await call(tools.businessDaysBetween, {
      startDate: "2026-06-23",
      endDate: "2026-06-29",
    });
    expect(out.calendarDays).toBe(7);
    expect(out.businessDays).toBe(5);
  });

  it("businessDaysBetween rejects a reversed range", async () => {
    const tools = buildHrTools(callers.employee);
    const out = await call(tools.businessDaysBetween, {
      startDate: "2026-06-29",
      endDate: "2026-06-23",
    });
    expect(out.error).toMatch(/on or after/i);
  });
});
