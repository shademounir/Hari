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
  "payslip:read:self",
  "payslip:read:any",
  "handbook:read", // RAG over the handbook / read the knowledge base
  "kb:manage", // create/edit/publish/archive KB documents & collections
  "employee:manage", // create/edit employees
  "admin:settings", // platform settings

  // SCRUM-039 — permissions centralisées de la matrice MVP HARI.
  "document:read", // consulter les documents RH validés
  "document:manage", // créer, valider, archiver des documents RH
  "attestation:request", // demander une attestation de travail
  "attestation:generate", // valider et générer une attestation (PDF)
  "attestation:download:self", // télécharger son propre PDF
  "attestation:download:any", // télécharger le PDF de n'importe qui
  "alert:read", // consulter la console des alertes IA
  "alert:manage", // changer le statut d'une alerte
  "logs:read", // consulter les AiEvents et AuditLogs
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
  "payslip:read:self": "View own payslips",
  "payslip:read:any": "View anyone's payslips",
  "handbook:read": "Ask the handbook (RAG)",
  "kb:manage": "Manage the knowledge base",
  "employee:manage": "Manage employee records",
  "admin:settings": "Manage platform settings",
  "document:read": "View validated HR documents",
  "document:manage": "Create, validate and archive HR documents",
  "attestation:request": "Request a work certificate",
  "attestation:generate": "Validate and generate a work certificate",
  "attestation:download:self": "Download own work certificate",
  "attestation:download:any": "Download anyone's work certificate",
  "alert:read": "View AI alerts",
  "alert:manage": "Manage AI alerts",
  "logs:read": "View AI events and audit logs",
};

const EMPLOYEE: Permission[] = [
  "directory:read:self",
  "leave:request",
  "leave:read:self",
  "payslip:read:self",
  "handbook:read",
  "document:read",
  "attestation:request",
  "attestation:download:self",
];

const MANAGER: Permission[] = [
  ...EMPLOYEE,
  "directory:read:team",
  "leave:approve",
];

const HR_ADMIN: Permission[] = [
  ...MANAGER,
  "directory:read:all",
  "salary:read:all",
  "payslip:read:any",
  "employee:manage",
  "kb:manage",
  "document:manage",
  "attestation:generate",
  "attestation:download:any",
];

const SUPER_ADMIN: Permission[] = [
  ...HR_ADMIN,
  "admin:settings",
  "alert:read",
  "alert:manage",
  "logs:read",
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

/** All permissions held by `role`. */
export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Does `role` hold every permission listed? */
export function canAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** Does `role` hold at least one of the permissions listed? */
export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
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
