// ─────────────────────────────────────────────────────────────────────────
// RBAC: a single source of truth for "who can do what".
// Pure data + pure functions — safe to import in client OR server code.
// The same matrix gates: UI (sidebar/pages), server actions, and AI tools.
// ─────────────────────────────────────────────────────────────────────────

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
  "leave:read:team",
  "leave:approve", // approve/reject requests
  "payslip:read:self",
  "payslip:read:any",
  "handbook:read", // RAG over the handbook
  "employee:manage", // create/edit employees
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
  "leave:read:team": "View team leave",
  "leave:approve": "Approve / reject leave",
  "payslip:read:self": "View own payslips",
  "payslip:read:any": "View anyone's payslips",
  "handbook:read": "Ask the handbook (RAG)",
  "employee:manage": "Manage employee records",
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
  "leave:read:team",
  "leave:approve",
];

const HR_ADMIN: Permission[] = [
  ...MANAGER,
  "directory:read:all",
  "salary:read:all",
  "payslip:read:any",
  "employee:manage",
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
