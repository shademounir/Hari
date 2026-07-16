import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import { getTeamLeaveRequests, getTeamScope, type Caller } from "@/lib/hr";

// SCRUM-071 Increment C — proves the URL filters can only ever NARROW within the
// caller's team scope. A crafted query string (bogus status, injection text, or
// a non-manager probing) can never surface another team's rows, because
// getTeamLeaveRequests scopes by getTeamScope FIRST and validates filter values.

const callers: Record<"employee" | "manager" | "hr", Caller> = {
  employee: { role: "EMPLOYEE", permissions: DEFAULT_ROLE_PERMISSIONS["EMPLOYEE"], employeeId: null },
  manager: { role: "MANAGER", permissions: DEFAULT_ROLE_PERMISSIONS["MANAGER"], employeeId: null },
  hr: { role: "HR_ADMIN", permissions: DEFAULT_ROLE_PERMISSIONS["HR_ADMIN"], employeeId: null },
};

const KEY_BY_EMAIL: Record<string, keyof typeof callers> = {
  "collaborateur@hari.ma": "employee",
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

describe("getTeamLeaveRequests — scope is enforced regardless of query string", () => {
  it("a manager sees EXACTLY their team's leave — no more, no less", async () => {
    const scope = await getTeamScope(callers.manager);
    const expected = await prisma.leaveRequest.count({
      where: { employeeId: { in: scope.employeeIds } },
    });
    const rows = await getTeamLeaveRequests(callers.manager, {});
    expect(rows.length).toBe(expected);
    expect(rows.length).toBeGreaterThan(0); // the seed gives the team real history
  });

  it("a non-manager (employee) sees nothing, even with crafted filters", async () => {
    const crafted = await getTeamLeaveRequests(callers.employee, {
      status: ["APPROVED", "PENDING"],
      type: ["VACATION"],
    });
    expect(crafted).toEqual([]);
  });

  it("invalid filter values (incl. a non-existent CANCELLED + injection) are dropped, scope holds", async () => {
    const scope = await getTeamScope(callers.manager);
    const scopedApproved = await prisma.leaveRequest.count({
      where: { employeeId: { in: scope.employeeIds }, status: "APPROVED" },
    });
    // "CANCELLED" isn't a LeaveStatus; the injection string is nonsense — both must
    // be discarded, leaving an APPROVED-only filter applied WITHIN the team.
    const rows = await getTeamLeaveRequests(callers.manager, {
      status: ["APPROVED", "CANCELLED", "'; DROP TABLE \"LeaveRequest\"; --"],
      type: ["not-a-type"],
    });
    expect(rows.length).toBe(scopedApproved);
    expect(rows.every((r) => r.status === "APPROVED")).toBe(true);
  });

  it("a filter can only narrow — filtered result never exceeds the unfiltered team set", async () => {
    const all = await getTeamLeaveRequests(callers.manager, {});
    const filtered = await getTeamLeaveRequests(callers.manager, { type: ["SICK"] });
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    expect(filtered.every((r) => r.type === "SICK")).toBe(true);
  });

  it("HR (whole-company scope) sees at least as much as the manager", async () => {
    const mgr = await getTeamLeaveRequests(callers.manager, {});
    const hr = await getTeamLeaveRequests(callers.hr, {});
    expect(hr.length).toBeGreaterThanOrEqual(mgr.length);
  });

  it("name search joins employee.user.name but never leaves the team scope", async () => {
    const scope = await getTeamScope(callers.manager);
    // A real teammate's name → only their rows, all inside the unfiltered set.
    const someone = await prisma.employee.findFirst({
      where: { id: { in: scope.employeeIds }, leaveRequests: { some: {} } },
      select: { user: { select: { name: true } } },
    });
    const name = someone!.user.name;
    const first = name.split(" ")[0];

    const all = await getTeamLeaveRequests(callers.manager, {});
    const searched = await getTeamLeaveRequests(callers.manager, { search: first });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.length).toBeLessThanOrEqual(all.length);
    expect(searched.every((r) => r.employeeName.includes(first))).toBe(true);

    // A name that isn't on the team can't surface anyone (case-insensitive miss).
    const miss = await getTeamLeaveRequests(callers.manager, { search: "Zznobodyxx" });
    expect(miss).toEqual([]);
    // Even a valid teammate name is empty for a non-manager (no scope at all).
    const asEmployee = await getTeamLeaveRequests(callers.employee, { search: first });
    expect(asEmployee).toEqual([]);
  });

  it("department facet narrows within the team", async () => {
    const all = await getTeamLeaveRequests(callers.manager, {});
    const it = await getTeamLeaveRequests(callers.manager, { departments: ["IT"] });
    const bogus = await getTeamLeaveRequests(callers.manager, { departments: ["NoSuchDept"] });
    expect(it.length).toBeLessThanOrEqual(all.length);
    expect(bogus).toEqual([]); // an out-of-team department matches nothing, never errors
  });
});
