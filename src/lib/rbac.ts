// ─────────────────────────────────────────────────────────────────────────
// RBAC: a single source of truth for "who can do what".
// Pure data + pure functions — safe to import in client OR server code.
// The same matrix gates: UI (sidebar/pages), server actions, and AI tools.
// ─────────────────────────────────────────────────────────────────────────
import type { DocVisibility } from "@prisma/client"; // type-only — erased at build

export const ROLES = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
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
  "payslip:read:self",
  "payslip:read:any",
  "handbook:read", // RAG over the handbook / read the knowledge base
  "kb:manage", // create/edit/publish/archive KB documents & collections
  "employee:manage", // create/edit employees
  "alerts:read", // view + triage AI observability alerts (Admin/HR)
  "predictions:read", // view departure-risk predictions (managers: own team, anonymized; HR: full)
  "predictions:manage", // recalibrate model weights / thresholds (HR/Admin)
  "admin:settings", // platform settings
] as const;
export type Permission = (typeof PERMISSIONS)[number];

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
  "payslip:read:self": "View own payslips",
  "payslip:read:any": "View anyone's payslips",
  "handbook:read": "Ask the handbook (RAG)",
  "kb:manage": "Manage the knowledge base",
  "employee:manage": "Manage employee records",
  "alerts:read": "View AI alerts",
  "predictions:read": "View departure-risk predictions",
  "predictions:manage": "Recalibrate the predictive model",
  "admin:settings": "Manage platform settings",
};

const EMPLOYEE: Permission[] = [
  "directory:read:self",
  "leave:request",
  "leave:read:self",
  "payslip:read:self",
  "handbook:read",
];

const MANAGER: Permission[] = [
  ...EMPLOYEE,
  "directory:read:team",
  "leave:approve",
  "dashboard:read:team",
  "predictions:read", // own team only, anonymized (enforced in the data/tool layer)
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
];

const SUPER_ADMIN: Permission[] = [
  ...HR_ADMIN,
  "admin:settings",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  EMPLOYEE,
  MANAGER,
  HR_ADMIN,
  SUPER_ADMIN,
};

/** Does `role` hold `permission`? */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * KB document access tiers a role may read, derived from the existing directory
 * permissions so KB access stays consistent with the rest of the app: an
 * employee who can't see the team directory can't read MANAGERS docs, and only
 * roles that see the whole company (HR/Super) read HR_ONLY docs. Used by both RAG
 * retrieval (`lib/rag.ts`) and the reader/data layer (`lib/kb.ts`).
 */
export function visibleDocTiers(role: Role): DocVisibility[] {
  if (can(role, "directory:read:all")) return ["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"];
  if (can(role, "directory:read:team")) return ["ALL_EMPLOYEES", "MANAGERS"];
  return ["ALL_EMPLOYEES"];
}
