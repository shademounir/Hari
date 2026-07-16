import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { permissionsForRole } from "@/lib/rbac-server";
import type { Actor, Permission, Role } from "@/lib/rbac";

/**
 * The signed-in caller. Carries `permissions` already resolved, which makes it a
 * `Subject` — so `can(user, "…")` works directly and stays synchronous.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId: string | null;
  permissions: readonly Permission[];
};

/**
 * Resolve the caller from the session cookie + the database.
 *
 * The JWT is trusted for IDENTITY ONLY (`token.sub`). Role and permissions are
 * read here, per request, because the token is long-lived (30 days by default)
 * and re-signing it does not refresh its claims: a role carried on the JWT would
 * mean a demotion took up to a month to apply. `cache()` dedupes this to one
 * lookup per request, and the org-wide matrix behind `permissionsForRole` is
 * memoized separately, so the real cost is a single indexed read on `User`.
 *
 * Returns null — never a partial caller — when the user is gone or deactivated,
 * so a disabled account is ejected on its very next request.
 */
const loadCaller = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      employee: { select: { id: true } },
    },
  });
  // Deleted or deactivated → no caller. Fail closed.
  if (!row?.active) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    employeeId: row.employee?.id ?? null,
    permissions: await permissionsForRole(row.role),
  };
});

/** Returns the signed-in user or redirects to /login. Use in server components. */
export async function requireUser(): Promise<SessionUser> {
  const user = await loadCaller();
  if (!user) redirect("/login");
  return user;
}

/**
 * Non-redirecting variant for Route Handlers, which must answer 401 rather than
 * bounce the browser. Same resolution, same fail-closed contract.
 */
export async function getApiCaller(): Promise<SessionUser | null> {
  return loadCaller();
}

/**
 * The caller as an `Actor` for write paths, which authorize AND stamp authorship.
 * Only the naming differs (`id` here, `userId` on the trail), so this exists to
 * keep that translation in one place rather than at every call site.
 */
export function actorOf(user: SessionUser): Actor {
  return { userId: user.id, role: user.role, permissions: user.permissions };
}
