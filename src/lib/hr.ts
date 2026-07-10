// ─────────────────────────────────────────────────────────────────────────
// Role-aware HR data access. ONE implementation used by both the dashboard
// pages and the AI tools, so the chatbot can never see more than the UI.
// Every function takes the caller's { role, employeeId } and scopes results.
// ─────────────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Permission, type Role } from "@/lib/rbac";
import type {
  AiEventKind,
  EmploymentStatus,
  EmploymentType,
  LeaveStatus,
  LeaveType,
} from "@prisma/client";

export type Caller = { role: Role; employeeId: string | null };

/**
 * Build a Caller, re-resolving `employeeId` from the DB instead of the JWT-cached
 * value (stale after a DB reset → would scope to a dead id). Shared by the team
 * page and the leave-decision actions so read and write paths use the same id.
 */
export async function resolveCaller(user: { id: string; role: Role }): Promise<Caller> {
  const employee = await prisma.employee.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  return { role: user.role, employeeId: employee?.id ?? null };
}

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
  status: EmploymentStatus;
  employmentType: EmploymentType;
};

/**
 * The set of employees the caller may see, as a Prisma WHERE. This is the single
 * source of "directory scope": reused by getEmployeeDirectory, getEmployeeDirectoryFacets
 * AND getPayslip so a tool can never reach an employee the dashboard wouldn't show
 * for that role. A caller with no employeeId matches the sentinel "__none__" →
 * empty set. Scope only — it must NOT encode employment-status filtering (that
 * would also hide e.g. a TERMINATED employee's payslip from HR).
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

const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "TERMINATED"] as const;

export type DirectoryFilters = {
  search?: string;
  status?: string[];
  departments?: string[];
  cities?: string[];
};

/**
 * Status clause for the directory listing. Honors an explicit (validated) status
 * filter from the UI; otherwise hides TERMINATED so the default directory stays
 * clean. Invalid status values are ignored, never passed to Prisma.
 */
function statusClause(status: string[] | undefined): Prisma.EmployeeWhereInput {
  const valid = (status ?? []).filter(
    (s): s is EmploymentStatus => (EMPLOYMENT_STATUSES as readonly string[]).includes(s),
  );
  return valid.length ? { status: { in: valid } } : { status: { not: "TERMINATED" } };
}

/** Employees visible to the caller, scoped by role and narrowed by UI filters. */
export async function getEmployeeDirectory(
  caller: Caller,
  filters: DirectoryFilters = {},
): Promise<DirectoryEntry[]> {
  const seesSalary = can(caller.role, "salary:read:all");

  const and: Prisma.EmployeeWhereInput[] = [
    directoryWhere(caller), // role scope — always first
    statusClause(filters.status),
  ];
  if (filters.search) {
    and.push({
      OR: [
        { user: { name: { contains: filters.search, mode: "insensitive" } } },
        { user: { email: { contains: filters.search, mode: "insensitive" } } },
      ],
    });
  }
  if (filters.departments?.length) and.push({ department: { in: filters.departments } });
  if (filters.cities?.length) and.push({ location: { in: filters.cities } });

  const rows = await prisma.employee.findMany({
    where: { AND: and },
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
    status: e.status,
    employmentType: e.employmentType,
  }));
}

/** Distinct departments/cities WITHIN the caller's scope — for filter options. */
export async function getEmployeeDirectoryFacets(
  caller: Caller,
): Promise<{ departments: string[]; cities: string[] }> {
  const rows = await prisma.employee.findMany({
    where: directoryWhere(caller),
    select: { department: true, location: true },
  });
  return {
    departments: Array.from(new Set(rows.map((r) => r.department))).sort(),
    cities: Array.from(new Set(rows.map((r) => r.location))).sort(),
  };
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
  // The approver's note recorded at decision time (mandatory on rejection).
  // Surfaced so the requester can read WHY, and the approver can audit the queue.
  decisionNote: string | null;
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
  decisionNote: string | null;
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
    decisionNote: r.decisionNote,
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
  // so we never read outside what getEmployeeDirectory would return for this role.
  const target = await prisma.employee.findFirst({
    where: { AND: [directoryWhere(caller), { id: resolvedId }] },
    include: { user: { select: { name: true } } },
  });
  if (!target) return { ok: false, reason: "not_found" };

  // `salary` is denominated in the org's configured currency (see settings.ts /
  // schema.prisma) — never converted; the cards format it with that currency.
  const grossMonthly = Math.round(target.salary / 12);
  const tax = Math.round(grossMonthly * 0.22);
  return {
    ok: true,
    payslip: {
      employeeName: target.user.name,
      grossMonthly,
      tax,
      netMonthly: grossMonthly - tax,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-071: Manager Team KPI dashboard. Aggregates only — never row-level PII.
// Every metric is bounded by the SAME scope the directory uses (`directoryWhere`),
// so a manager can never count outside self + their direct reports.
// ─────────────────────────────────────────────────────────────────────────

/** How many days of AI-usage history the dashboard aggregates. */
const AI_USAGE_WINDOW_DAYS = 7;

/**
 * The caller's team as ready-to-query id sets. `AiEvent` joins via `userId`,
 * everything else via `employeeId`, so we return both. This is THE single
 * scoping authority for the KPI services in `lib/kpi/*` — those services must
 * never resolve scope themselves; they accept a `TeamScope` and filter by it.
 * Empty sets when the caller lacks `dashboard:read:team`.
 */
export type TeamScope = {
  employeeIds: string[];
  userIds: string[];
};

export async function getTeamScope(caller: Caller): Promise<TeamScope> {
  if (!can(caller.role, "dashboard:read:team")) return { employeeIds: [], userIds: [] };
  const rows = await prisma.employee.findMany({
    where: directoryWhere(caller), // ← the ONE source of scope
    select: { id: true, userId: true },
  });
  return {
    employeeIds: rows.map((r) => r.id),
    userIds: rows.map((r) => r.userId),
  };
}

export type TeamKpis = {
  headcount: number; // employees in the caller's directory scope (self + reports)
  pendingRequests: number; // PENDING leave from direct reports — mirrors the approval queue
  aiTurns7d: number; // completed assistant turns by the team, last 7d
  aiRefusals7d: number; // tool refusals by the team, last 7d
};

/**
 * Team KPIs for the manager dashboard, gated by `dashboard:read:team`. Resolves
 * the caller's employee scope ONCE via `directoryWhere`, then runs metadata-only
 * aggregates in parallel:
 *  - headcount / AI usage over that scope;
 *  - pendingRequests using the EXACT predicate of `getPendingApprovals` (reports
 *    for a manager, company-wide for a directory:read:all role), so the KPI card
 *    and the approvals table can't disagree.
 * `AiEvent` has no employeeId, so AI usage joins via the team's `userId`s. An empty
 * team yields `{ in: [] }` → matches nothing → zeros, never a global count.
 */
export async function getTeamKpis(
  caller: Caller,
  opts: { scope?: TeamScope; now?: Date } = {},
): Promise<TeamKpis> {
  const empty: TeamKpis = { headcount: 0, pendingRequests: 0, aiTurns7d: 0, aiRefusals7d: 0 };
  if (!can(caller.role, "dashboard:read:team")) return empty;

  // Scope + clock are threaded in from getTeamDashboard: scope avoids re-running
  // the directoryWhere query, and a shared `now` keeps the value and its sparkline
  // on one clock (they'd diverge under a fixed test clock).
  const { employeeIds, userIds } = opts.scope ?? (await getTeamScope(caller));
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - AI_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [pendingRequests, aiByKind] = await Promise.all([
    // Mirror getPendingApprovals exactly: a directory:read:all role approves
    // company-wide, so its KPI must count company-wide or the card and the
    // approvals table disagree.
    prisma.leaveRequest.count({
      where: can(caller.role, "directory:read:all")
        ? { status: "PENDING" }
        : { status: "PENDING", employee: { managerId: caller.employeeId ?? "__none__" } },
    }),
    prisma.aiEvent.groupBy({
      by: ["kind"],
      where: { userId: { in: userIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const kindCount = (k: AiEventKind): number =>
    aiByKind.find((r) => r.kind === k)?._count._all ?? 0;

  return {
    headcount: employeeIds.length,
    pendingRequests,
    aiTurns7d: kindCount("TURN"),
    aiRefusals7d: kindCount("REFUSAL"),
  };
}

// Valid filter values, mirrored from the schema enums. Note: LeaveStatus has NO
// CANCELLED value, so the Status filter offers only these three. Anything else
// from the query string is dropped before it reaches Prisma.
const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const LEAVE_TYPES = ["VACATION", "SICK", "PERSONAL"] as const;

export type TeamLeaveFilters = {
  search?: string;
  status?: string[];
  type?: string[];
  departments?: string[];
};

/**
 * The team's leave requests (all statuses), for the filterable history table.
 * Scope is enforced FIRST by `employeeId IN getTeamScope(...)` — the same
 * directoryWhere-derived set the rest of the dashboard uses. Every other filter
 * (search, department) is a nested relation filter on THIS row's `employee`, so
 * it can only narrow which of the already-scoped rows match — never reach an
 * employee outside the team. Status/type are validated against the schema enums
 * (invalid values — a bogus status, an injection string — are discarded before
 * Prisma, which would otherwise throw on a non-enum value). Prisma parameterizes
 * all values, so the free-text search + department strings can't inject SQL.
 */
export async function getTeamLeaveRequests(
  caller: Caller,
  filters: TeamLeaveFilters = {},
  preResolvedScope?: TeamScope,
): Promise<LeaveRequestView[]> {
  const scope = preResolvedScope ?? (await getTeamScope(caller));
  if (scope.employeeIds.length === 0) return [];

  const statuses = (filters.status ?? []).filter((s): s is LeaveStatus =>
    (LEAVE_STATUSES as readonly string[]).includes(s),
  );
  const types = (filters.type ?? []).filter((t): t is LeaveType =>
    (LEAVE_TYPES as readonly string[]).includes(t),
  );

  const and: Prisma.LeaveRequestWhereInput[] = [
    { employeeId: { in: scope.employeeIds } }, // ← scope authority, always first
  ];
  if (statuses.length) and.push({ status: { in: statuses } });
  if (types.length) and.push({ type: { in: types } });
  if (filters.departments?.length) {
    and.push({ employee: { department: { in: filters.departments } } });
  }
  if (filters.search?.trim()) {
    // Name search joins through the SAME row's employee → user; AND-ed inside the
    // scope predicate, so it narrows the team set and can't cross team boundaries.
    and.push({
      employee: { user: { name: { contains: filters.search.trim(), mode: "insensitive" } } },
    });
  }

  const rows = await prisma.leaveRequest.findMany({
    where: { AND: and },
    include: { employee: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRequestView);
}

export type LeaveDecision = "APPROVED" | "REJECTED";

/**
 * Approve or reject a PENDING leave request, scoped exactly like
 * `getPendingApprovals`: the caller needs `leave:approve` AND (unless they can
 * read the whole company) the request must belong to one of their direct reports.
 * Implemented as a scoped `updateMany` so an out-of-scope, missing, or
 * already-decided id matches zero rows and mutates nothing — the caller learns
 * only "it changed / it didn't", never whether the id exists elsewhere. Stamps
 * the approver. Returns true iff exactly the intended row transitioned.
 */
export async function decideLeaveRequest(
  caller: Caller,
  requestId: string,
  decision: LeaveDecision,
  note?: string | null,
): Promise<boolean> {
  const count = await bulkDecideLeaveRequests(caller, [requestId], decision, note);
  return count > 0;
}

/**
 * Approve/reject MANY pending requests in one scoped statement. Same invariant as
 * the single-row path: the WHERE carries the manager→report predicate (or the
 * whole company for HR), so any id in `requestIds` that isn't in the caller's
 * scope, already decided, or nonexistent simply matches nothing — no error, no
 * leak. `note` is the approver's decision note (persisted for both outcomes;
 * callers enforce that it is non-empty for a rejection). Returns rows changed.
 */
export async function bulkDecideLeaveRequests(
  caller: Caller,
  requestIds: string[],
  decision: LeaveDecision,
  note?: string | null,
): Promise<number> {
  if (!can(caller.role, "leave:approve") || !caller.employeeId) return 0;
  if (requestIds.length === 0) return 0;

  const where: Prisma.LeaveRequestWhereInput = {
    id: { in: requestIds },
    status: "PENDING",
    ...(can(caller.role, "directory:read:all")
      ? {}
      : { employee: { managerId: caller.employeeId } }),
  };

  const res = await prisma.leaveRequest.updateMany({
    where,
    data: {
      status: decision,
      approverId: caller.employeeId,
      decisionNote: note?.trim() ? note.trim() : null,
    },
  });
  return res.count;
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-080: HR validation of a requested GeneratedDocument (HARI-88/HARI-90).
// `documents:validate` is HR_ADMIN/SUPER_ADMIN only and — unlike leave approval —
// isn't team-scoped: any HR holder may decide on any request, so no extra
// directoryWhere-style predicate is needed beyond the permission check itself.
// ─────────────────────────────────────────────────────────────────────────

export type DocumentRequestView = {
  id: string;
  employeeName: string;
  type: string;
  requestedAt: string;
};

/** REQUESTED documents awaiting an HR decision. Empty unless the caller may validate. */
export async function getPendingDocumentRequests(caller: Caller): Promise<DocumentRequestView[]> {
  if (!can(caller.role, "documents:validate")) return [];

  const rows = await prisma.generatedDocument.findMany({
    where: { status: "REQUESTED" },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { requestedAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    employeeName: r.requestedBy?.name ?? "—",
    type: r.type,
    requestedAt: r.requestedAt.toISOString().slice(0, 10),
  }));
}

export type DocumentDecision = "VALIDATED" | "REJECTED";

/**
 * Approve or reject a REQUESTED document. Implemented as a scoped `updateMany`
 * (status must still be REQUESTED) so a stale, already-decided, or nonexistent
 * id matches zero rows and mutates nothing — same fail-quiet invariant as
 * `decideLeaveRequest`. `validatorUserId` stamps `validatedById` (a User FK,
 * unlike leave's Employee-scoped `approverId`) — resolved by the caller from the
 * DB, not the JWT cache, mirroring `requestWorkCertificate`. A rejection requires
 * a non-empty `note` (enforced by the caller, not here). Returns true iff the
 * document transitioned.
 */
export async function decideDocumentRequest(
  caller: Caller,
  validatorUserId: string,
  documentId: string,
  decision: DocumentDecision,
  note?: string | null,
): Promise<boolean> {
  if (!can(caller.role, "documents:validate")) return false;

  const res = await prisma.generatedDocument.updateMany({
    where: { id: documentId, status: "REQUESTED" },
    data: {
      status: decision,
      validatedById: validatorUserId,
      validatedAt: decision === "VALIDATED" ? new Date() : undefined,
      rejectedAt: decision === "REJECTED" ? new Date() : undefined,
      rejectionNote: decision === "REJECTED" ? (note?.trim() ? note.trim() : null) : null,
    },
  });
  return res.count > 0;
}