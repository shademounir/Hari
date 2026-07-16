import "server-only";
import { Prisma } from "@prisma/client";
import type { EmploymentStatus, EmploymentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { can, type Actor, type Role } from "@/lib/rbac";
import { getRbacMatrix, type RbacMatrix } from "@/lib/rbac-server";
import { normalizeEmail } from "@/lib/auth/tokens";
import { issueInvite } from "@/lib/auth/flows";

// ─────────────────────────────────────────────────────────────────────────
// User administration (employee:manage). The first write path against
// User/Employee in the app: before this, the only User write anywhere was a
// password reset, and the only Employee write was the offboarding archive —
// `employee:manage` gated offboarding alone, despite its label promising
// "create/edit employees".
//
// Three rules, all enforced here rather than in the UI:
//
//   1. No escalation — you may only assign a role whose permissions are a SUBSET
//      of your own. This is what makes separation of duties real: HR manages
//      people, but cannot mint a super admin and become one.
//   2. No self-modification — you cannot change your own role or deactivate
//      yourself. (Mirrors the no-self-rating guard in team/engagement/actions.)
//   3. No lockout — the last active admin:settings holder can't be demoted or
//      deactivated.
//
// Sensitive fields follow the read rules: `salary` is only writable by a caller
// who could already read it (salary:read:all), so this can't become a side door
// onto compensation.
// ─────────────────────────────────────────────────────────────────────────

const MANAGE = "employee:manage" as const;

export type UserListEntry = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /**
   * Provisioned but never signed in: no password AND no confirmed email, so the
   * invite link is still the only way in. NOT `!emailVerified` — a seeded or
   * password-created account has a hash and simply never used a magic link, and
   * flagging those as "pending" would be a lie about every account in the demo.
   */
  pendingInvite: boolean;
  /** Null for a User with no Employee profile. */
  employeeId: string | null;
  title: string | null;
  department: string | null;
  status: EmploymentStatus | null;
  avatarUrl: string | null;
  isSelf: boolean;
  /**
   * May the caller re-role or deactivate this person? False when the target's
   * current role grants access the caller lacks (you can't manage someone who
   * outranks you). The UI disables those controls; the server enforces it too.
   */
  manageable: boolean;
};

export type UserWriteError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "email_taken"
  | "unknown_role"
  | "escalation"
  | "self_forbidden"
  | "would_lock_out"
  | "manager_cycle"
  // The target holds access the caller doesn't — you can't re-role or deactivate
  // someone who outranks you (HR can't touch a Super Admin). Separate from
  // `escalation`, which is about the role you'd ASSIGN; this is about the person.
  | "target_outranks"
  | "internal";

export type UserWriteResult = { ok: true; id: string } | { ok: false; error: UserWriteError };

// ── Reads ────────────────────────────────────────────────────────────────

export type UserFilter = { q?: string; role?: string; state?: "active" | "inactive" };

/** Every user, for the admin console. Empty for anyone without employee:manage. */
export async function listUsers(caller: Actor, filter: UserFilter = {}): Promise<UserListEntry[]> {
  if (!can(caller, MANAGE)) return [];

  const q = filter.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.state ? { active: filter.state === "active" } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [matrix, rows] = await Promise.all([
    getRbacMatrix(),
    prisma.user.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        emailVerified: true,
        passwordHash: true,
        employee: {
          select: { id: true, title: true, department: true, status: true, avatarUrl: true },
        },
      },
    }),
  ]);

  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    pendingInvite: !u.passwordHash && !u.emailVerified,
    employeeId: u.employee?.id ?? null,
    title: u.employee?.title ?? null,
    department: u.employee?.department ?? null,
    status: u.employee?.status ?? null,
    avatarUrl: u.employee?.avatarUrl ?? null,
    isSelf: u.id === caller.userId,
    manageable: roleWithinReach(matrix, caller, u.role),
  }));
}

export type UserDetail = UserListEntry & {
  location: string | null;
  employmentType: EmploymentType | null;
  managerId: string | null;
  startDate: Date | null;
  /** Null when the caller may not read compensation — never a zero. */
  salary: number | null;
};

export async function getUserDetail(caller: Actor, id: string): Promise<UserDetail | null> {
  if (!can(caller, MANAGE)) return null;
  const [matrix, u] = await Promise.all([
    getRbacMatrix(),
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        emailVerified: true,
        passwordHash: true,
        employee: true,
      },
    }),
  ]);
  if (!u) return null;

  // Same rule as the directory: compensation is stripped server-side unless the
  // caller holds salary:read:all.
  const seesSalary = can(caller, "salary:read:all");
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    pendingInvite: !u.passwordHash && !u.emailVerified,
    employeeId: u.employee?.id ?? null,
    title: u.employee?.title ?? null,
    department: u.employee?.department ?? null,
    status: u.employee?.status ?? null,
    avatarUrl: u.employee?.avatarUrl ?? null,
    location: u.employee?.location ?? null,
    employmentType: u.employee?.employmentType ?? null,
    managerId: u.employee?.managerId ?? null,
    startDate: u.employee?.startDate ?? null,
    salary: seesSalary ? (u.employee?.salary ?? null) : null,
    isSelf: u.id === caller.userId,
    manageable: roleWithinReach(matrix, caller, u.role),
  };
}

// ── Guards ───────────────────────────────────────────────────────────────

/**
 * Is `role` within `caller`'s reach — i.e. does it grant nothing the caller
 * lacks? The one subset predicate behind BOTH guards below:
 *   • assignment  — you may only put someone INTO a role you could hold yourself;
 *   • management  — you may only re-role/deactivate someone whose CURRENT role
 *     you could hold yourself (so HR can't touch a Super Admin).
 * An unknown slug is out of reach (fail closed). Pure — the caller passes the
 * already-loaded matrix, so per-row use in `listUsers` costs no extra query.
 */
function roleWithinReach(matrix: RbacMatrix, caller: Actor, role: Role): boolean {
  const target = matrix.bySlug[role];
  if (!target) return false;
  return target.permissions.every((p) => can(caller, p));
}

/**
 * May `caller` put someone into `role`? Only if that role grants nothing the
 * caller doesn't already hold. Without this the `employee:manage` holder (HR)
 * could assign SUPER_ADMIN and escalate through a second account.
 */
async function canAssignRole(caller: Actor, role: Role): Promise<boolean> {
  return roleWithinReach(await getRbacMatrix(), caller, role);
}

/**
 * May `caller` re-role or deactivate a user whose CURRENT role is `role`? Same
 * subset rule as assignment, applied to the person being acted on. Without it,
 * `employee:manage` (HR) could demote or disable a Super Admin — separation of
 * duties only holds in the direction the caller can't out-reach.
 */
async function canManageUser(caller: Actor, role: Role): Promise<boolean> {
  return roleWithinReach(await getRbacMatrix(), caller, role);
}

/**
 * Would this leave nobody able to reach settings? True when `userId` is the last
 * ACTIVE holder of a role carrying admin:settings and is being demoted/disabled.
 */
async function lastAdminStandingAfter(
  userId: string,
  next: { role?: Role; active?: boolean },
): Promise<boolean> {
  const matrix = await getRbacMatrix();
  const adminRoles = matrix.roles
    .filter((r) => r.permissions.includes("admin:settings"))
    .map((r) => r.slug);
  if (adminRoles.length === 0) return false;

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true },
  });
  if (!current) return false;
  const wasAdmin = current.active && adminRoles.includes(current.role);
  if (!wasAdmin) return false; // not an admin now → can't be the last one

  const stillAdmin =
    (next.active ?? current.active) && adminRoles.includes(next.role ?? current.role);
  if (stillAdmin) return false;

  const others = await prisma.user.count({
    where: { active: true, role: { in: adminRoles }, id: { not: userId } },
  });
  return others === 0;
}

/** Walk up the org chart: would making `managerId` the manager of `employeeId` loop? */
async function wouldCycle(employeeId: string, managerId: string | null): Promise<boolean> {
  if (!managerId) return false;
  if (managerId === employeeId) return true;
  let cursor: string | null = managerId;
  // The chart is self-referential and nothing else prevents a loop; an undetected
  // one would hang every manager-scoped traversal.
  for (let hops = 0; cursor && hops < 64; hops++) {
    const row: { managerId: string | null } | null = await prisma.employee.findUnique({
      where: { id: cursor },
      select: { managerId: true },
    });
    cursor = row?.managerId ?? null;
    if (cursor === employeeId) return true;
  }
  return false;
}

// ── Writes ───────────────────────────────────────────────────────────────

export type InviteInput = {
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  managerId?: string | null;
  salary?: number | null;
  startDate?: Date | null;
};

/**
 * Provision a User + Employee and email a one-time link to set the first
 * password. Provisioning stays server-side and gated: sign-in still never creates
 * an account (auth.ts refuses an unknown Google email), so this is the only door.
 */
export async function inviteUser(caller: Actor, input: InviteInput): Promise<UserWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !email.includes("@") || !name) return { ok: false, error: "invalid" };
  if (!(await canAssignRole(caller, input.role))) {
    const matrix = await getRbacMatrix();
    return { ok: false, error: matrix.bySlug[input.role] ? "escalation" : "unknown_role" };
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, error: "email_taken" };
  }
  // Only a caller who could read compensation may set it.
  const salary = can(caller, "salary:read:all") ? Math.max(0, Math.trunc(input.salary ?? 0)) : 0;

  let userId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        // No passwordHash: the invite link is what sets the first one.
        data: { email, name, role: input.role, active: true },
        select: { id: true },
      });
      await tx.employee.create({
        data: {
          userId: user.id,
          title: input.title.trim() || "—",
          department: input.department.trim() || "—",
          location: input.location.trim() || "—",
          employmentType: input.employmentType,
          startDate: input.startDate ?? new Date(),
          managerId: input.managerId || null,
          salary,
        },
      });
      return user;
    });
    userId = created.id;
  } catch (err) {
    console.error("[users] invite failed:", err);
    return { ok: false, error: "internal" };
  }

  // Best-effort, exactly like the audit trail: the account exists either way, and
  // HR can always re-send. Failing the whole invite over a mail hiccup would
  // leave a half-provisioned person nobody knows about.
  await issueInvite(email).catch((err) => console.error("[users] invite email failed:", err));

  await recordAudit(caller, {
    action: "USER_INVITED",
    targetType: "User",
    targetId: userId,
    // A role slug is a code; the name/email would be PII and stay off the trail.
    meta: { role: input.role },
  });
  return { ok: true, id: userId };
}

export type ProfileInput = {
  userId: string;
  name: string;
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  managerId?: string | null;
  salary?: number | null;
};

export async function updateUserProfile(
  caller: Actor,
  input: ProfileInput,
): Promise<UserWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, employee: { select: { id: true } } },
  });
  if (!target) return { ok: false, error: "not_found" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "invalid" };

  const employeeId = target.employee?.id;
  if (employeeId && (await wouldCycle(employeeId, input.managerId || null))) {
    return { ok: false, error: "manager_cycle" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { name } });
      if (employeeId) {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            title: input.title.trim() || undefined,
            department: input.department.trim() || undefined,
            location: input.location.trim() || undefined,
            employmentType: input.employmentType,
            managerId: input.managerId || null,
            // Omitted entirely for a caller who can't read compensation, so the
            // field can't be zeroed by someone who never saw it.
            ...(can(caller, "salary:read:all") && input.salary != null
              ? { salary: Math.max(0, Math.trunc(input.salary)) }
              : {}),
          },
        });
      }
    });
  } catch (err) {
    console.error("[users] profile update failed:", err);
    return { ok: false, error: "internal" };
  }

  await recordAudit(caller, { action: "USER_UPDATED", targetType: "User", targetId: target.id });
  return { ok: true, id: target.id };
}

export type UpdateUserInput = ProfileInput & { role: Role };

/**
 * Profile + role in ONE atomic save — what the edit form calls. Splitting them
 * into two sequential actions let a refused role change land AFTER the profile
 * had already committed (a half-save with a `USER_UPDATED` row but no role
 * change). Here every rule is checked BEFORE anything is written, both writes
 * share one `$transaction`, and the two audit actions are still recorded
 * separately (a role change is `USER_ROLE_CHANGED`, not folded into `USER_UPDATED`).
 */
export async function updateUser(caller: Actor, input: UpdateUserInput): Promise<UserWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  });
  if (!target) return { ok: false, error: "not_found" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "invalid" };

  const roleChanging = input.role !== target.role;
  if (roleChanging) {
    // Same guard set as changeUserRole, run up front so a refusal writes nothing.
    if (target.id === caller.userId) return { ok: false, error: "self_forbidden" };
    if (!(await canManageUser(caller, target.role))) return { ok: false, error: "target_outranks" };
    if (!(await canAssignRole(caller, input.role))) {
      const matrix = await getRbacMatrix();
      return { ok: false, error: matrix.bySlug[input.role] ? "escalation" : "unknown_role" };
    }
    if (await lastAdminStandingAfter(target.id, { role: input.role })) {
      return { ok: false, error: "would_lock_out" };
    }
  }

  const employeeId = target.employee?.id;
  if (employeeId && (await wouldCycle(employeeId, input.managerId || null))) {
    return { ok: false, error: "manager_cycle" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { name, ...(roleChanging ? { role: input.role } : {}) },
      });
      if (employeeId) {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            title: input.title.trim() || undefined,
            department: input.department.trim() || undefined,
            location: input.location.trim() || undefined,
            employmentType: input.employmentType,
            managerId: input.managerId || null,
            ...(can(caller, "salary:read:all") && input.salary != null
              ? { salary: Math.max(0, Math.trunc(input.salary)) }
              : {}),
          },
        });
      }
    });
  } catch (err) {
    console.error("[users] update failed:", err);
    return { ok: false, error: "internal" };
  }

  await recordAudit(caller, { action: "USER_UPDATED", targetType: "User", targetId: target.id });
  if (roleChanging) {
    await recordAudit(caller, {
      action: "USER_ROLE_CHANGED",
      targetType: "User",
      targetId: target.id,
      meta: { from: target.role, to: input.role },
    });
  }
  return { ok: true, id: target.id };
}

export async function changeUserRole(
  caller: Actor,
  userId: string,
  role: Role,
): Promise<UserWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };
  // You don't get to promote yourself, and you don't get to demote yourself into
  // a state you can't undo.
  if (userId === caller.userId) return { ok: false, error: "self_forbidden" };

  const current = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!current) return { ok: false, error: "not_found" };
  if (current.role === role) return { ok: true, id: userId };

  // You can't re-role someone who already outranks you (their CURRENT role grants
  // access you lack) — checked before the target role, so HR gets a clear
  // "outranked" over a misleading "escalation" when touching a Super Admin.
  if (!(await canManageUser(caller, current.role))) {
    return { ok: false, error: "target_outranks" };
  }
  if (!(await canAssignRole(caller, role))) {
    const matrix = await getRbacMatrix();
    return { ok: false, error: matrix.bySlug[role] ? "escalation" : "unknown_role" };
  }
  if (await lastAdminStandingAfter(userId, { role })) {
    return { ok: false, error: "would_lock_out" };
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  } catch (err) {
    console.error("[users] role change failed:", err);
    return { ok: false, error: "internal" };
  }

  await recordAudit(caller, {
    action: "USER_ROLE_CHANGED",
    targetType: "User",
    targetId: userId,
    // Role slugs are codes, not PII — and the from/to is the whole point.
    meta: { from: current.role, to: role },
  });
  return { ok: true, id: userId };
}

export async function setUserActive(
  caller: Actor,
  userId: string,
  active: boolean,
): Promise<UserWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };
  if (userId === caller.userId) return { ok: false, error: "self_forbidden" };

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });
  if (!current) return { ok: false, error: "not_found" };
  if (current.active === active) return { ok: true, id: userId };
  // Can't switch off (or back on) someone who outranks you.
  if (!(await canManageUser(caller, current.role))) {
    return { ok: false, error: "target_outranks" };
  }
  if (!active && (await lastAdminStandingAfter(userId, { active: false }))) {
    return { ok: false, error: "would_lock_out" };
  }

  try {
    // Deactivating disables the LOGIN. Archiving the person is a different act
    // (lib/offboarding: Employee.status → TERMINATED, never a delete), so this
    // deliberately leaves the employee record alone.
    await prisma.user.update({
      where: { id: userId },
      data: { active, deactivatedAt: active ? null : new Date() },
    });
  } catch (err) {
    console.error("[users] activation change failed:", err);
    return { ok: false, error: "internal" };
  }

  await recordAudit(caller, {
    action: active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
    targetType: "User",
    targetId: userId,
  });
  return { ok: true, id: userId };
}

/** Re-send the first-password link for someone who hasn't signed in yet. */
export async function resendInvite(caller: Actor, userId: string): Promise<UserWriteResult> {
  if (!can(caller, MANAGE)) return { ok: false, error: "forbidden" };
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, active: true, passwordHash: true, emailVerified: true },
  });
  // Only for an OUTSTANDING invite: no password AND no confirmed email (the same
  // `pendingInvite` predicate the roster shows). Re-issuing a set-password link to
  // an account that already has one would be a reset nobody asked for.
  if (!u?.active || u.passwordHash || u.emailVerified) return { ok: false, error: "not_found" };
  await issueInvite(u.email);
  await recordAudit(caller, {
    action: "USER_INVITED",
    targetType: "User",
    targetId: userId,
    meta: { resend: true },
  });
  return { ok: true, id: userId };
}

/** Managers to choose from, for the org-chart picker. */
export async function listManagerOptions(
  caller: Actor,
): Promise<{ id: string; name: string; title: string }[]> {
  if (!can(caller, MANAGE)) return [];
  const rows = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    orderBy: { user: { name: "asc" } },
    select: { id: true, title: true, user: { select: { name: true } } },
    take: 500,
  });
  return rows.map((r) => ({ id: r.id, name: r.user.name, title: r.title }));
}
