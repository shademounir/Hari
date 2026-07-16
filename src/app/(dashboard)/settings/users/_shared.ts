import "server-only";
import { EmploymentType } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { can, type Subject } from "@/lib/rbac";
import { getRbacMatrix, getRoleLabels } from "@/lib/rbac-server";
import type { RoleOption } from "@/components/settings/user-form";

export const EMPLOYMENT_TYPES = Object.values(EmploymentType);

/**
 * Roles the form offers, each marked assignable or not. A role is assignable only
 * if every permission it grants is one the caller already holds — the same subset
 * rule lib/users enforces on write. Offering it disabled beats hiding it: "you
 * can't grant what you don't have" is a rule worth seeing.
 */
export async function roleOptionsFor(caller: Subject): Promise<RoleOption[]> {
  const [matrix, labels] = await Promise.all([
    getRbacMatrix(),
    getRoleLabels(await getTranslations("roles")),
  ]);
  return matrix.roles.map((r) => ({
    slug: r.slug,
    label: labels[r.slug] ?? r.slug,
    assignable: r.permissions.every((p) => can(caller, p)),
  }));
}
