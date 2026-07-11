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
  "analytics:full", // company-wide HR analytics: absenteeism, turnover, payroll, pyramid (HR/Admin)
  "analytics:team", // team-scoped HR analytics for a manager (no payroll)
  "payslip:read:self",
  "payslip:read:any",
  "handbook:read", // RAG over the handbook / read the knowledge base
  "kb:manage", // create/edit/publish/archive KB documents & collections
  "employee:manage", // create/edit employees
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
  "analytics:full": "View company HR analytics (absenteeism, turnover, payroll)",
  "analytics:team": "View team HR analytics",
  "payslip:read:self": "View own payslips",
  "payslip:read:any": "View anyone's payslips",
  "handbook:read": "Ask the handbook (RAG)",
  "kb:manage": "Manage the knowledge base",
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

const EMPLOYEE: Permission[] = [
  "directory:read:self",
  "leave:request",
  "leave:read:self",
  "payslip:read:self",
  "handbook:read",
  "documents:request",
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
