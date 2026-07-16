import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import {
  BUILTIN_ROLES,
  can,
  isBuiltinRole,
  isPermission,
  type Actor,
  type Permission,
  type Role,
} from "@/lib/rbac";
import { getRbacMatrix, invalidateRbacMatrix, type ResolvedRole } from "@/lib/rbac-server";

// ─────────────────────────────────────────────────────────────────────────
// Role administration (admin:settings). The write side of the effective matrix.
//
// This is a SECURITY table, not a tuning table. PredictiveWeightConfig is the
// structural precedent, but a bad row there degrades a score — a bad row here is
// a privilege escalation or a permanent lockout. So every rule below is enforced
// here, server-side, and the UI only mirrors them:
//
//   1. No lockout        — SUPER_ADMIN always keeps `admin:settings`, and no save
//                          may leave zero ACTIVE users holding it.
//   2. No escalation     — a caller may only GRANT permissions they hold. Revoking
//                          is always allowed; the matrix can narrow, never widen
//                          past the person editing it.
//   3. Built-ins persist — their slug is immutable and they cannot be deleted.
//   4. Closed vocabulary — only strings in PERMISSIONS are stored (isPermission).
//
// Strict nesting (EMPLOYEE ⊂ MANAGER ⊂ …) is deliberately NOT enforced: a custom
// role breaks containment by design. It holds for the built-in defaults only, and
// tests/rbac.test.ts pins that.
// ─────────────────────────────────────────────────────────────────────────

/** The permission that gates managing roles at all. */
const MANAGE = "admin:settings" as const;

export type RoleWithUsage = ResolvedRole & { userCount: number };

export type RoleWriteError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "slug_taken"
  | "builtin_immutable"
  | "role_in_use"
  | "escalation"
  | "would_lock_out"
  | "internal";

export type RoleWriteResult = { ok: true; slug: Role } | { ok: false; error: RoleWriteError };

const SLUG_RE = /^[A-Z][A-Z0-9_]{1,31}$/;

/** Normalize a submitted slug: `Field Auditor` → `FIELD_AUDITOR`. */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/** Keep only what the code enforces, de-duplicated and in PERMISSIONS order. */
function sanitizePermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isPermission))];
}

/** Every role, with how many users hold it (the delete guard + the list UI). */
export async function listRolesWithUsage(caller: Actor): Promise<RoleWithUsage[]> {
  if (!can(caller, MANAGE)) return [];
  const [matrix, counts] = await Promise.all([
    getRbacMatrix(),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);
  const byRole = new Map(counts.map((c) => [c.role, c._count._all]));
  return matrix.roles.map((r) => ({ ...r, userCount: byRole.get(r.slug) ?? 0 }));
}

export async function getRole(caller: Actor, slug: Role): Promise<RoleWithUsage | null> {
  if (!can(caller, MANAGE)) return null;
  return (await listRolesWithUsage(caller)).find((r) => r.slug === slug) ?? null;
}

/**
 * Permissions `caller` is not allowed to hand out — anything they don't hold
 * themselves. Guardrail #2: without this, separation of duties is a hole, not a
 * feature (an admin with a narrow custom role could mint a wider one and take it).
 */
function cannotGrant(caller: Actor, adding: Permission[]): Permission[] {
  return adding.filter((p) => !can(caller, p));
}

/**
 * Would this change leave nobody able to administer the platform? Counts ACTIVE
 * users whose role would still hold `admin:settings` afterwards. Guardrail #1:
 * `/settings` is the only door to this editor, so one careless save could brick
 * it permanently with no way back short of a DB console.
 */
async function wouldLockOut(next: { slug: Role; permissions: Permission[] }): Promise<boolean> {
  const matrix = await getRbacMatrix();
  const stillAdmin = new Set(
    matrix.roles
      .filter((r) =>
        r.slug === next.slug ? next.permissions.includes(MANAGE) : r.permissions.includes(MANAGE),
      )
      .map((r) => r.slug),
  );
  if (stillAdmin.size === 0) return true;
  const holders = await prisma.user.count({
    where: { active: true, role: { in: [...stillAdmin] } },
  });
  return holders === 0;
}

export async function createRole(
  caller: Actor,
  input: { slug: string; label: string; description?: string; permissions: unknown },
): Promise<RoleWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };

  const slug = normalizeSlug(input.slug);
  const label = input.label.trim().slice(0, 60);
  if (!SLUG_RE.test(slug) || !label) return { ok: false, error: "invalid" };
  // A custom role may never shadow a built-in: the resolver treats built-in slugs
  // specially (NULL → code defaults), so a collision would be genuinely ambiguous.
  if (isBuiltinRole(slug)) return { ok: false, error: "slug_taken" };

  const permissions = sanitizePermissions(input.permissions);
  if (cannotGrant(caller, permissions).length > 0) return { ok: false, error: "escalation" };

  try {
    await prisma.role.create({
      data: {
        slug,
        label,
        description: input.description?.trim().slice(0, 200) || null,
        builtIn: false,
        rank: 50, // after the built-ins; custom roles sort by slug within that
        permissions,
        updatedById: caller.userId,
      },
    });
  } catch (err) {
    if (String(err).includes("Unique constraint")) return { ok: false, error: "slug_taken" };
    console.error("[roles] create failed:", err);
    return { ok: false, error: "internal" };
  }

  invalidateRbacMatrix();
  await recordAudit(caller, {
    action: "ROLE_CREATED",
    targetType: "Role",
    targetId: slug,
    // Permission KEYS are codes, not PII — safe on the trail, and the whole point
    // of the record is knowing what a role was given.
    meta: { permissions },
  });
  return { ok: true, slug };
}

export async function updateRole(
  caller: Actor,
  input: {
    slug: string;
    label: string;
    description?: string;
    permissions: unknown;
    /** True → store NULL (a built-in reverts to the code defaults). */
    resetToDefaults?: boolean;
  },
): Promise<RoleWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };

  const matrix = await getRbacMatrix();
  const current = matrix.bySlug[input.slug];
  if (!current) return { ok: false, error: "not_found" };

  const label = input.label.trim().slice(0, 60);
  if (!label) return { ok: false, error: "invalid" };

  // Reset only means anything for a built-in — it is the code defaults it reverts to.
  const reset = Boolean(input.resetToDefaults) && current.builtIn;
  const permissions = reset ? null : sanitizePermissions(input.permissions);

  // Guardrail #1: the super admin's own door stays open, always.
  const effective =
    permissions ??
    (isBuiltinRole(current.slug) ? current.permissions : ([] as readonly Permission[]));
  if (current.slug === "SUPER_ADMIN" && !effective.includes(MANAGE)) {
    return { ok: false, error: "would_lock_out" };
  }
  if (!reset && permissions) {
    // Only GRANTS are checked. Revoking a permission you don't hold is fine —
    // the matrix may always narrow.
    const adding = permissions.filter((p) => !current.permissions.includes(p));
    if (cannotGrant(caller, adding).length > 0) return { ok: false, error: "escalation" };
    if (await wouldLockOut({ slug: current.slug, permissions })) {
      return { ok: false, error: "would_lock_out" };
    }
  }

  try {
    await prisma.role.update({
      where: { slug: current.slug },
      data: {
        label,
        description: input.description?.trim().slice(0, 200) || null,
        // Prisma.DbNull writes a SQL NULL. A plain `null` would store the JSON
        // value `null`, which the resolver reads as "a custom role with no
        // permissions" rather than "a built-in using the code defaults" —
        // silently stripping every permission instead of restoring them.
        permissions: permissions === null ? Prisma.DbNull : permissions,
        updatedById: caller.userId,
      },
    });
  } catch (err) {
    console.error("[roles] update failed:", err);
    return { ok: false, error: "internal" };
  }

  invalidateRbacMatrix();
  await recordAudit(caller, {
    action: "ROLE_UPDATED",
    targetType: "Role",
    targetId: current.slug,
    meta: reset ? { reset: true } : { permissions: permissions ?? [] },
  });
  return { ok: true, slug: current.slug };
}

export async function deleteRole(caller: Actor, slug: Role): Promise<RoleWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };
  if (isBuiltinRole(slug)) return { ok: false, error: "builtin_immutable" };

  // Checked here for a readable error; the FK (ON DELETE RESTRICT) is the actual
  // guarantee, so a race between this count and the delete still can't orphan a user.
  const users = await prisma.user.count({ where: { role: slug } });
  if (users > 0) return { ok: false, error: "role_in_use" };

  try {
    await prisma.role.delete({ where: { slug } });
  } catch (err) {
    if (String(err).includes("Foreign key")) return { ok: false, error: "role_in_use" };
    console.error("[roles] delete failed:", err);
    return { ok: false, error: "internal" };
  }

  invalidateRbacMatrix();
  await recordAudit(caller, { action: "ROLE_DELETED", targetType: "Role", targetId: slug });
  return { ok: true, slug };
}

/** Slugs that may never be deleted or renamed, for the UI to disable its controls. */
export const IMMUTABLE_SLUGS: readonly string[] = BUILTIN_ROLES;
