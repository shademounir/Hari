"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorOf, requireUser } from "@/lib/session";
import { PERMISSIONS } from "@/lib/rbac";
import { createRole, deleteRole, updateRole, type RoleWriteResult } from "@/lib/roles";

// Thin wrappers: every rule (permission gate, no-escalation, no-lockout, closed
// vocabulary) lives in lib/roles.ts, which re-checks all of it — these just parse
// input and revalidate. Same shape as saveWeightConfigAction.

const RoleInput = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  // Validated against the code's permission union, so an unknown string is a
  // parse error here and would be dropped by the data layer anyway.
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  resetToDefaults: z.boolean().optional(),
});

export type SaveRoleResult = RoleWriteResult;

// A role change rewrites what every holder may do, and the nav + every page read
// the matrix — so the whole dashboard has to re-render, not just this page.
function refresh() {
  revalidatePath("/", "layout");
}

export async function createRoleAction(input: unknown): Promise<SaveRoleResult> {
  const user = await requireUser();
  const parsed = RoleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const res = await createRole(actorOf(user), parsed.data);
  if (res.ok) refresh();
  return res;
}

export async function updateRoleAction(input: unknown): Promise<SaveRoleResult> {
  const user = await requireUser();
  const parsed = RoleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const res = await updateRole(actorOf(user), parsed.data);
  if (res.ok) refresh();
  return res;
}

export async function deleteRoleAction(slug: string): Promise<SaveRoleResult> {
  const user = await requireUser();
  if (typeof slug !== "string" || !slug) return { ok: false, error: "invalid" };

  const res = await deleteRole(actorOf(user), slug);
  if (res.ok) refresh();
  return res;
}
