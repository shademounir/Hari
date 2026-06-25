// ─────────────────────────────────────────────────────────────────────────
// Role-aware HR data access. ONE implementation used by both the dashboard
// pages and the AI tools, so the chatbot can never see more than the UI.
// Every function takes the caller's { role, employeeId } and scopes results.
// ─────────────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Permission, type Role } from "@/lib/rbac";

export type Caller = { role: Role; employeeId: string | null };

export type DirectoryEntry = {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  location: string;
  role: Role;
  managerName: string | null;
  isSelf: boolean;
  salary: number | null; // null unless caller may read compensation
};

/**
 * The set of employees the caller may see, as a Prisma WHERE. This is the single
 * source of "directory scope": reused by getDirectory AND getPayslip so a tool
 * can never reach an employee the dashboard wouldn't show for that role. A
 * caller with no employeeId matches the sentinel "__none__" → empty set.
 */
function directoryWhere(caller: Caller): Prisma.EmployeeWhereInput {
  if (can(caller.role, "directory:read:all")) return {};
  if (can(caller.role, "directory:read:team")) {
    // Self + direct reports.
    return {
      OR: [
        { id: caller.employeeId ?? "__none__" },
        { managerId: caller.employeeId ?? "__none__" },
      ],
    };
  }
  // Self only.
  return { id: caller.employeeId ?? "__none__" };
}

/** Employees visible to the caller, scoped by role. */
export async function getDirectory(caller: Caller): Promise<DirectoryEntry[]> {
  const seesSalary = can(caller.role, "salary:read:all");

  const rows = await prisma.employee.findMany({
    where: directoryWhere(caller),
    include: {
      user: { select: { name: true, email: true, role: true } },
      manager: { include: { user: { select: { name: true } } } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return rows.map((e) => ({
    id: e.id,
    name: e.user.name,
    email: e.user.email,
    title: e.title,
    department: e.department,
    location: e.location,
    role: e.user.role as Role,
    managerName: e.manager?.user.name ?? null,
    isSelf: e.id === caller.employeeId,
    salary: seesSalary ? e.salary : null,
  }));
}

/**
 * Narrows an already-scoped directory by a free-text query (name / department /
 * title). Always applied AFTER `getDirectory`, never instead of it — a search
 * can only narrow the caller's existing scope, never escape it. Shared by the
 * dashboard page and the `getEmployeeDirectory` AI tool so both filter the
 * same way.
 */
export function filterDirectory(
  entries: DirectoryEntry[],
  query?: string | null,
): DirectoryEntry[] {
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter((e) =>
    [e.name, e.department, e.title].some((v) => v.toLowerCase().includes(q)),
  );
}

export type LeaveBalanceView = {
  type: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
};

export async function getLeaveBalances(employeeId: string): Promise<LeaveBalanceView[]> {
  const balances = await prisma.leaveBalance.findMany({ where: { employeeId } });
  return balances.map((b) => ({
    type: b.type,
    totalDays: b.totalDays,
    usedDays: b.usedDays,
    remainingDays: b.totalDays - b.usedDays,
  }));
}

export type LeaveRequestView = {
  id: string;
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string | null;
};

function toRequestView(r: {
  id: string;
  employee: { user: { name: string } };
  type: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: string;
  reason: string | null;
}): LeaveRequestView {
  return {
    id: r.id,
    employeeName: r.employee.user.name,
    type: r.type,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    days: r.days,
    status: r.status,
    reason: r.reason,
  };
}

/** The caller's own leave requests. */
export async function getMyLeaveRequests(employeeId: string): Promise<LeaveRequestView[]> {
  const rows = await prisma.leaveRequest.findMany({
    where: { employeeId },
    include: { employee: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRequestView);
}

/** Pending requests the caller is allowed to approve (their reports / everyone). */
export async function getPendingApprovals(caller: Caller): Promise<LeaveRequestView[]> {
  if (!can(caller.role, "leave:approve")) return [];

  const where = can(caller.role, "directory:read:all")
    ? { status: "PENDING" as const }
    : {
        status: "PENDING" as const,
        employee: { managerId: caller.employeeId ?? "__none__" },
      };

  const rows = await prisma.leaveRequest.findMany({
    where,
    include: { employee: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRequestView);
}

export type PayslipView = {
  employeeName: string;
  period: string;
  grossMonthly: number;
  tax: number;
  netMonthly: number;
};

/** Distinguishes "you can't" from "no such visible employee" without leaking which. */
export type PayslipResult =
  | { ok: true; payslip: PayslipView }
  | { ok: false; reason: "denied"; permission: Permission }
  | { ok: false; reason: "not_found" };

/**
 * A payslip for `targetId` (defaults to the caller), scoped two ways:
 *  1. permission — own payslip needs `payslip:read:self`, anyone else's needs
 *     `payslip:read:any`;
 *  2. visibility — the target must be inside the caller's directory scope
 *     (`directoryWhere`), so a guessed/hallucinated id can never resolve to a
 *     real person. The id is resolved server-side, never trusted blindly.
 */
export async function getPayslip(
  caller: Caller,
  targetId?: string | null,
): Promise<PayslipResult> {
  const wantsOther = !!targetId && targetId !== caller.employeeId;
  const permission: Permission = wantsOther ? "payslip:read:any" : "payslip:read:self";
  if (!can(caller.role, permission)) return { ok: false, reason: "denied", permission };

  const resolvedId = wantsOther ? targetId! : caller.employeeId;
  if (!resolvedId) return { ok: false, reason: "not_found" };

  // One scoped query: the id AND the caller's visibility predicate must match,
  // so we never read outside what getDirectory would return for this role.
  const target = await prisma.employee.findFirst({
    where: { AND: [directoryWhere(caller), { id: resolvedId }] },
    include: { user: { select: { name: true } } },
  });
  if (!target) return { ok: false, reason: "not_found" };

  const grossMonthly = Math.round(target.salary / 12);
  const tax = Math.round(grossMonthly * 0.22);
  return {
    ok: true,
    payslip: {
      employeeName: target.user.name,
      period: "Most recent month",
      grossMonthly,
      tax,
      netMonthly: grossMonthly - tax,
    },
  };
}
