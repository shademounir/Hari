"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, type Role } from "@/lib/rbac";
import { acknowledgeAlert, resolveAlert, reopenAlert } from "@/lib/alerts";
import { recordAuditLog } from "@/lib/audit";

// Both actions re-check `alerts:read` server-side (defense in depth: the page +
// nav are already gated, and lib/alerts checks too) before mutating.
async function requireAlertsReader() {
  const user = await requireUser();
  if (!can(user.role, "alerts:read")) redirect("/");
  return { role: user.role, userId: user.id };
}

// SCRUM-064: every status transition is a sensitive action, so it is also
// written to AuditLog (in addition to the ackById/resolvedById already
// stamped on the Alert row itself). Best-effort — never blocks the action.
function auditStatusChange(actor: { role: Role; userId: string }, id: string, to: string) {
  return recordAuditLog({
    action: "ALERT_STATUS_CHANGE",
    actorId: actor.userId,
    actorRole: actor.role,
    targetType: "Alert",
    targetId: id,
    meta: { to },
  });
}

export async function acknowledgeAlertAction(id: string): Promise<void> {
  const actor = await requireAlertsReader();
  const ok = await acknowledgeAlert(actor, id);
  if (ok) await auditStatusChange(actor, id, "ACKNOWLEDGED");
  revalidatePath("/alerts");
}

export async function resolveAlertAction(id: string): Promise<void> {
  const actor = await requireAlertsReader();
  const ok = await resolveAlert(actor, id);
  if (ok) await auditStatusChange(actor, id, "RESOLVED");
  revalidatePath("/alerts");
}

export async function reopenAlertAction(id: string): Promise<void> {
  const actor = await requireAlertsReader();
  const ok = await reopenAlert(actor, id);
  if (ok) await auditStatusChange(actor, id, "OPEN");
  revalidatePath("/alerts");
}
