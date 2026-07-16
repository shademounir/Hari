"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { acknowledgeAlert, resolveAlert, reopenAlert } from "@/lib/alerts";

// Both actions re-check `alerts:read` server-side (defense in depth: the page +
// nav are already gated, and lib/alerts checks too) before mutating.
async function requireAlertsReader() {
  const user = await requireUser();
  if (!can(user, "alerts:read")) redirect("/");
  return actorOf(user);
}

export async function acknowledgeAlertAction(id: string): Promise<void> {
  const actor = await requireAlertsReader();
  await acknowledgeAlert(actor, id);
  revalidatePath("/alerts");
}

export async function resolveAlertAction(id: string): Promise<void> {
  const actor = await requireAlertsReader();
  await resolveAlert(actor, id);
  revalidatePath("/alerts");
}

export async function reopenAlertAction(id: string): Promise<void> {
  const actor = await requireAlertsReader();
  await reopenAlert(actor, id);
  revalidatePath("/alerts");
}
