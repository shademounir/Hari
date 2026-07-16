// ─────────────────────────────────────────────────────────────────────────
// RBAC: the permission VOCABULARY and the BUILT-IN defaults.
// Pure data + pure functions — safe to import in client OR server code.
//
// Roles are data (the `Role` table); permissions are code. That split is
// deliberate and load-bearing:
//
//   • A permission is a code artifact — each one is read by a literal somewhere
//     that enforces it, so a permission no code reads would enforce nothing.
//     Keeping `Permission` a compile-time union keeps every `can()` call site
//     type-checked and keeps TOOL_CATALOGUE statically bound to it.
//   • It also means an admin CANNOT invent a permission through a form: the
//     resolver only ever accepts strings already in `PERMISSIONS` (see
//     `isPermission`). That is what preserves the `engagement:read:self`
//     privacy invariant below by construction rather than by vigilance.
//
// The effective role→permission matrix is resolved server-side by
// `lib/rbac-server.ts`; this module holds the defaults it falls back to.
// ─────────────────────────────────────────────────────────────────────────
import type { DocVisibility } from "@prisma/client"; // type-only — erased at build

/**
 * A role slug. Roles are rows in the `Role` table now, so this is a plain
 * string, not a union — a super admin can define new ones at runtime. The four
 * built-ins below are the ones this codebase ships with and can reason about
 * statically; everything else is data.
 */
export type Role = string;

export const BUILTIN_ROLES = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;
export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

export function isBuiltinRole(v: string): v is BuiltinRole {
  return (BUILTIN_ROLES as readonly string[]).includes(v);
}

/** English fallback labels for the built-ins. UI prefers the `roles.*` i18n keys. */
export const BUILTIN_ROLE_LABELS: Record<BuiltinRole, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR_ADMIN: "HR Admin",
  SUPER_ADMIN: "Super Admin",
};

// Every distinct capability in the app.
export const PERMISSIONS = [
  "directory:read:self", // view own profile
  "directory:read:team", // view direct reports
  "directory:read:all", // view whole company
  "salary:read:all", // see compensation for anyone
  "leave:request", // submit time-off
  "leave:read:self",
  "leave:approve", // approve/reject requests
  "dashboard:read:team", // view aggregated team KPIs (headcount, pending, AI usage)
  "dashboard:read:company", // view company-wide AI activity + document corpus KPIs (HR/Admin)
  "analytics:full", // company-wide HR analytics: absenteeism, turnover, payroll, pyramid (HR/Admin)
  "analytics:team", // team-scoped HR analytics for a manager (no payroll)
  "payslip:read:self",
  "payslip:read:any",
  "handbook:read", // RAG over the handbook / read the knowledge base
  "kb:manage", // create/edit/publish/archive KB documents & collections
  "profile:edit:self", // edit own display name + avatar (self-service)
  "employee:manage", // create/edit employees, invite users, assign roles
  "alerts:read", // view + triage AI observability alerts (Admin/HR)
  "documents:request", // request own generated HR documents
  "predictions:read", // view departure-risk predictions (managers: own team, anonymized; HR: full)
  "predictions:manage", // recalibrate model weights / thresholds (HR/Admin)
  // SCRUM-099 engagement/burnout. NOTE: there is deliberately NO `engagement:read:self` —
  // employees must NEVER see their own engagement score (psychological-harm + GDPR Art. 22).
  "engagement:read:team", // view engagement for own reports (managers)
  "engagement:read:all", // view company-wide engagement (HR/Admin)
  "engagement:input", // submit qualitative manager ratings for own reports
  "engagement:manage", // recalibrate engagement weights / thresholds (HR/Admin)
  "documents:download:any", // download any generated document (HR/Admin); employees download their own implicitly
  "admin:settings", // platform settings, roles, and the permission matrix
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Is `v` a permission this codebase actually enforces? The single filter every
 * DB-sourced permission list passes through, so an unknown/legacy/hand-edited
 * string in a `Role.permissions` row is dropped rather than honored.
 */
export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v);
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  "directory:read:self": "View own profile",
  "directory:read:team": "View direct reports",
  "directory:read:all": "View entire company directory",
  "salary:read:all": "View anyone's compensation",
  "leave:request": "Request time off",
  "leave:read:self": "View own leave",
  "leave:approve": "Approve / reject leave",
  "dashboard:read:team": "View team KPI dashboard",
  "dashboard:read:company": "View company AI activity & documents dashboard",
  "analytics:full": "View company HR analytics (absenteeism, turnover, payroll)",
  "analytics:team": "View team HR analytics",
  "payslip:read:self": "View own payslips",
  "payslip:read:any": "View anyone's payslips",
  "handbook:read": "Ask the handbook (RAG)",
  "kb:manage": "Manage the knowledge base",
  "profile:edit:self": "Edit own profile and avatar",
  "employee:manage": "Manage employee records",
  "alerts:read": "View AI alerts",
  "documents:request": "Request own HR documents",
  "predictions:read": "View departure-risk predictions",
  "predictions:manage": "Recalibrate the predictive model",
  "engagement:read:team": "View team engagement & burnout risk",
  "engagement:read:all": "View company-wide engagement & burnout risk",
  "engagement:input": "Submit qualitative engagement ratings",
  "engagement:manage": "Recalibrate the engagement model",
  "documents:download:any": "Download any generated HR document",
  "admin:settings": "Manage platform settings",
};

/**
 * The domain half of a `domain:action:scope` permission — the grouping the
 * role editor renders. Derived from the string itself, so adding a permission
 * needs no extra metadata to stay grouped.
 */
export function permissionDomain(permission: Permission): string {
  return permission.split(":")[0];
}

const EMPLOYEE: Permission[] = [
  "directory:read:self",
  "leave:request",
  "leave:read:self",
  "payslip:read:self",
  "handbook:read",
  "documents:request",
  "profile:edit:self",
];

const MANAGER: Permission[] = [
  ...EMPLOYEE,
  "directory:read:team",
  "leave:approve",
  "dashboard:read:team",
  "predictions:read", // own team only, anonymized (enforced in the data/tool layer)
  "analytics:team",
  "engagement:read:team", // own reports only; scores are NEVER shown to the subject
  "engagement:input", // rate own reports' work quality / participation / peer interaction
];

const HR_ADMIN: Permission[] = [
  ...MANAGER,
  "directory:read:all",
  "salary:read:all",
  "payslip:read:any",
  "employee:manage",
  "kb:manage",
  "alerts:read",
  "dashboard:read:company",
  "predictions:manage", // recalibration; predictions:read inherited from MANAGER
  "analytics:full",
  "engagement:read:all", // whole company; engagement:read:team + input inherited from MANAGER
  "engagement:manage", // recalibrate engagement weights / thresholds
  "documents:download:any",
];

const SUPER_ADMIN: Permission[] = [
  ...HR_ADMIN,
  "admin:settings",
];

/**
 * The built-in matrix. A built-in `Role` row carries `permissions = NULL`,
 * which the resolver reads as "use this" — so these arrays stay the one source
 * of truth for the shipped defaults and the migration can't drift from them.
 * "Reset to defaults" in the editor writes NULL back.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<BuiltinRole, Permission[]> = {
  EMPLOYEE,
  MANAGER,
  HR_ADMIN,
  SUPER_ADMIN,
};

/**
 * A resolved authorization subject: who is acting, and what they effectively
 * hold. Built once per request from the session + the DB matrix (never from
 * client input), then passed down. `permissions` is already resolved so `can()`
 * stays synchronous and pure — it is called inside client renders and Prisma
 * where-builders, neither of which can await.
 */
export type Subject = { role: Role; permissions: readonly Permission[] };

/** Does `subject` hold `permission`? */
export function can(subject: Subject, permission: Permission): boolean {
  return subject.permissions.includes(permission);
}

/**
 * A Subject plus the acting user's id: what a WRITE needs, since it both
 * authorizes and stamps authorship (who approved, acknowledged, offboarded).
 * Read paths take a plain Subject — they have no author to record.
 */
export type Actor = Subject & { userId: string };

/** A subject holding the built-in defaults for `role` — for tests and fallbacks. */
export function builtinSubject(role: BuiltinRole): Subject {
  return { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] };
}

/**
 * The scope unattended work runs with: the nightly cron jobs, and the live
 * fallback the predictive dashboard uses when no snapshot exists yet.
 *
 * Deliberately NOT a role from the matrix. These jobs used to borrow
 * SUPER_ADMIN's scope, which was safe only while the matrix was a constant —
 * now that an admin can untick a box, that would let a UI edit silently stop the
 * nightly scoring from seeing anyone (an empty result, not an error, so nobody
 * would notice). It grants exactly the company-wide READS the jobs need.
 *
 * This is not an escalation path: it is not reachable from a request. The cron
 * routes authenticate with CRON_SECRET and fail closed, and no user is ever
 * assigned this subject.
 */
export const SYSTEM_SUBJECT: Subject = {
  role: "SYSTEM",
  permissions: ["directory:read:all", "engagement:read:all"],
};

/**
 * KB document access tiers a subject may read, derived from the existing directory
 * permissions so KB access stays consistent with the rest of the app: someone who
 * can't see the team directory can't read MANAGERS docs, and only subjects that see
 * the whole company read HR_ONLY docs. Used by both RAG retrieval (`lib/rag.ts`)
 * and the reader/data layer (`lib/kb.ts`).
 *
 * NOTE for the role editor: this couples KB visibility to `directory:read:*`, so
 * granting `directory:read:team` also grants MANAGERS-tier handbook articles. The
 * editor surfaces that inline — it is the least obvious consequence in the matrix.
 */
export function visibleDocTiers(subject: Subject): DocVisibility[] {
  if (can(subject, "directory:read:all")) return ["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"];
  if (can(subject, "directory:read:team")) return ["ALL_EMPLOYEES", "MANAGERS"];
  return ["ALL_EMPLOYEES"];
}
