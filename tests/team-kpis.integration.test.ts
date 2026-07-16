import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import {
  bulkDecideLeaveRequests,
  getMyLeaveRequests,
  getPendingApprovals,
  getTeamKpis,
  getTeamLeaveRequests,
  getTeamScope,
  type Caller,
} from "@/lib/hr";

// SCRUM-071 review fixes:
//  #1 — the pendingRequests KPI must use the SAME predicate as getPendingApprovals
//       for EVERY role, so the card and the approvals table can never disagree
//       (the bug: HR/admin counted only their own reports while the table showed
//       the whole company).
//  #2 — a decision note (mandatory on rejection) must be readable by both the
//       approver (team history) and the employee (their own requests); before the
//       fix it was write-only.

const callers: Record<"manager" | "hr", Caller> = {
  manager: { role: "MANAGER", permissions: DEFAULT_ROLE_PERMISSIONS["MANAGER"], employeeId: null },
  hr: { role: "HR_ADMIN", permissions: DEFAULT_ROLE_PERMISSIONS["HR_ADMIN"], employeeId: null },
};
const KEY_BY_EMAIL: Record<string, keyof typeof callers> = {
  "manager@hari.ma": "manager",
  "rh@hari.ma": "hr",
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
      employeeId: u.employee!.id,
    };
  }
});

afterAll(() => prisma.$disconnect());

describe("getTeamKpis.pendingRequests mirrors the approvals queue (#1)", () => {
  it("equals getPendingApprovals length for a manager (reports-only scope)", async () => {
    const kpis = await getTeamKpis(callers.manager);
    const approvals = await getPendingApprovals(callers.manager);
    expect(kpis.pendingRequests).toBe(approvals.length);
  });

  it("equals getPendingApprovals length for HR (company-wide scope)", async () => {
    const kpis = await getTeamKpis(callers.hr);
    const approvals = await getPendingApprovals(callers.hr);
    // The regression: this was managerId-scoped (often 0) while the table showed
    // every company PENDING. They must now agree.
    expect(kpis.pendingRequests).toBe(approvals.length);
  });

  it("HR's company-wide pending count is >= a single manager's", async () => {
    const hr = await getTeamKpis(callers.hr);
    const mgr = await getTeamKpis(callers.manager);
    expect(hr.pendingRequests).toBeGreaterThanOrEqual(mgr.pendingRequests);
  });
});

describe("decision note is persisted AND surfaced (#2)", () => {
  it("a rejection note reaches both the approver's history and the employee's view", async () => {
    const scope = await getTeamScope(callers.manager);
    const reportId = scope.employeeIds.find((id) => id !== callers.manager.employeeId);
    expect(reportId).toBeTruthy();

    // A throwaway PENDING request for a direct report, cleaned up after.
    const created = await prisma.leaveRequest.create({
      data: {
        employeeId: reportId!,
        type: "VACATION",
        startDate: new Date("2027-01-04"),
        endDate: new Date("2027-01-06"),
        days: 3,
        status: "PENDING",
        reason: "decision-note round-trip test",
      },
    });

    try {
      const note = "Insufficient coverage that week — please replan.";
      const changed = await bulkDecideLeaveRequests(callers.manager, [created.id], "REJECTED", note);
      expect(changed).toBe(1);

      // Approver sees it in the team history table.
      const history = await getTeamLeaveRequests(callers.manager, {});
      expect(history.find((r) => r.id === created.id)?.decisionNote).toBe(note);

      // The rejected employee sees WHY in their own requests.
      const mine = await getMyLeaveRequests(reportId!);
      expect(mine.find((r) => r.id === created.id)?.decisionNote).toBe(note);
    } finally {
      await prisma.leaveRequest.delete({ where: { id: created.id } });
    }
  });
});
