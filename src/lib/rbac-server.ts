import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  BUILTIN_ROLE_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  isBuiltinRole,
  isPermission,
  type BuiltinRole,
  type Permission,
  type Role,
  type Subject,
} from "@/lib/rbac";

// ─────────────────────────────────────────────────────────────────────────
// The EFFECTIVE RBAC matrix: the built-in defaults from `lib/rbac.ts`, overlaid
// with whatever the `Role` table says. This is the server-side authority for
// "who may do what"; `lib/rbac.ts` only holds the vocabulary and the defaults.
//
// Resolution is deliberately NARROWING and fail-closed:
//   • `permissions = NULL` on a built-in → the code defaults.
//   • otherwise → the row's array, FILTERED through `isPermission`, so an
//     unknown / legacy / hand-edited string is dropped rather than honored.
//   • an unknown role slug → NO permissions (not "the defaults", not a throw).
//
// This mirrors the `getActiveModelConfig()` discipline in predictive/data-layer:
// iterate over what the CODE knows, never over what the row claims.
// ─────────────────────────────────────────────────────────────────────────

export type ResolvedRole = {
  slug: Role;
  label: string;
  description: string | null;
  builtIn: boolean;
  rank: number;
  /** True when a built-in still uses the code defaults (`permissions` is NULL). */
  usesDefaults: boolean;
  permissions: Permission[];
};

export type RbacMatrix = {
  roles: ResolvedRole[];
  bySlug: Record<Role, ResolvedRole>;
};

/**
 * How long a resolved matrix may be reused across requests in this process.
 *
 * The matrix is org-wide and changes only when a super admin saves the editor,
 * so re-reading it per request is pure waste. The user's OWN role is NOT cached
 * this way — `getCaller` reads the User row every request — so a demotion or a
 * deactivation still takes effect on the very next request. Only a permission
 * change to a role lags, by at most this window, and only on a process that
 * didn't serve the write.
 */
const MATRIX_TTL_MS = 30_000;

let memo: { at: number; value: RbacMatrix } | null = null;

/** Drop the process-local matrix memo. Called by the writers after a save. */
export function invalidateRbacMatrix(): void {
  memo = null;
}

function resolveRow(row: {
  slug: string;
  label: string;
  description: string | null;
  builtIn: boolean;
  rank: number;
  permissions: unknown;
}): ResolvedRole {
  const builtinDefaults = isBuiltinRole(row.slug) ? DEFAULT_ROLE_PERMISSIONS[row.slug] : null;

  // NULL on a built-in means "use the code defaults" — the whole reason the
  // migration seeds NULL rather than copying the arrays into the database.
  const usesDefaults = row.permissions == null && builtinDefaults != null;
  const permissions: Permission[] = usesDefaults
    ? [...builtinDefaults!]
    : Array.isArray(row.permissions)
      ? // Drop anything the code doesn't enforce. A form can't invent a
        // permission, and a stale row can't resurrect a deleted one.
        [...new Set(row.permissions.filter(isPermission))]
      : // A custom role with a null/garbage array holds nothing (fail closed).
        [];

  return {
    slug: row.slug,
    label: row.label,
    description: row.description,
    builtIn: row.builtIn,
    rank: row.rank,
    usesDefaults,
    permissions,
  };
}

async function loadMatrix(): Promise<RbacMatrix> {
  const rows = await prisma.role.findMany({
    orderBy: [{ rank: "asc" }, { slug: "asc" }],
    select: {
      slug: true,
      label: true,
      description: true,
      builtIn: true,
      rank: true,
      permissions: true,
    },
  });

  const roles = rows.map(resolveRow);
  return { roles, bySlug: Object.fromEntries(roles.map((r) => [r.slug, r])) };
}

/**
 * The effective matrix. `cache()` dedupes within one request; the TTL memo above
 * keeps it off the hot path across requests.
 */
export const getRbacMatrix = cache(async (): Promise<RbacMatrix> => {
  if (memo && Date.now() - memo.at < MATRIX_TTL_MS) return memo.value;
  const value = await loadMatrix();
  memo = { at: Date.now(), value };
  return value;
});

/** The permissions a role slug effectively holds. Unknown slug → none (fail closed). */
export async function permissionsForRole(role: Role): Promise<Permission[]> {
  const matrix = await getRbacMatrix();
  return matrix.bySlug[role]?.permissions ?? [];
}

/** A resolved `Subject` for an arbitrary role slug — for admin previews and tools. */
export async function subjectForRole(role: Role): Promise<Subject> {
  return { role, permissions: await permissionsForRole(role) };
}

/** A `ResolvedRole` viewed as an authorization Subject (`slug` → `role`). */
export function subjectOf(role: ResolvedRole): Subject {
  return { role: role.slug, permissions: role.permissions };
}

/**
 * Display label for a role slug, in English. Prefer `getRoleLabels` in the UI —
 * this one is for non-localized surfaces (the chat system prompt).
 *
 * A slug with no row left — a deleted custom role on a historical AiEvent /
 * AuditLog snapshot — falls back to the raw slug. That fallback is exactly why
 * those two columns carry no foreign key.
 */
export function roleLabelFrom(matrix: RbacMatrix, role: Role): string {
  return (
    matrix.bySlug[role]?.label ?? (isBuiltinRole(role) ? BUILTIN_ROLE_LABELS[role] : role)
  );
}

/**
 * Slug → display label for every role, for the UI.
 *
 * Built-in roles are TRANSLATED via the `roles.*` i18n keys. Custom role labels
 * are user data and stay untranslated — the same call the KB makes for
 * `KbCollection.name`: you can't put user-entered text in a message catalog.
 *
 * Pass the result down (server) or through `RoleLabelsProvider` (client) rather
 * than calling `t(slug)` directly, which only ever typechecks for the built-ins.
 */
export async function getRoleLabels(
  t: (key: BuiltinRole) => string,
): Promise<Record<Role, string>> {
  const matrix = await getRbacMatrix();
  return Object.fromEntries(
    matrix.roles.map((r) => [r.slug, r.builtIn && isBuiltinRole(r.slug) ? t(r.slug) : r.label]),
  );
}

/**
 * Slug → description, same split as `getRoleLabels`: a built-in's description is
 * HARI's own copy and is translated; a custom role's is user data.
 *
 * `t` resolves the `roles` namespace, so a built-in reads `description.<SLUG>`.
 */
export async function getRoleDescriptions(
  t: (key: `description.${BuiltinRole}`) => string,
): Promise<Record<Role, string | null>> {
  const matrix = await getRbacMatrix();
  return Object.fromEntries(
    matrix.roles.map((r) => [
      r.slug,
      r.builtIn && isBuiltinRole(r.slug) ? t(`description.${r.slug}` as const) : r.description,
    ]),
  );
}
