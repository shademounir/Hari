"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  initiateOffboarding,
  setOffboardingStepStatus,
  completeOffboarding,
  asOffboardingReason,
} from "@/lib/offboarding";

// SCRUM-096 — every offboarding action re-checks `employee:manage` server-side
// (defense in depth: the page + nav are already gated, and lib/offboarding
// checks too) before mutating, and records to the AuditLog for compliance.
async function requireHr() {
  const user = await requireUser();
  if (!can(user.role, "employee:manage")) redirect("/");
  return { userId: user.id, role: user.role };
}

export async function initiateOffboardingAction(formData: FormData): Promise<void> {
  const actor = await requireHr();
  const employeeId = String(formData.get("employeeId") ?? "");
  const reason = asOffboardingReason(String(formData.get("reason") ?? ""));
  const lastDayRaw = String(formData.get("lastDay") ?? "");
  const lastDay = lastDayRaw ? new Date(lastDayRaw) : null;
  if (!employeeId || !lastDay || Number.isNaN(lastDay.getTime())) return;

  await initiateOffboarding(actor, { employeeId, reason, lastDay });
  revalidatePath("/offboarding");
}

export async function setOffboardingStepAction(taskId: string, done: boolean): Promise<void> {
  const actor = await requireHr();
  await setOffboardingStepStatus(actor, taskId, done);
  revalidatePath("/offboarding");
}

export async function completeOffboardingAction(offboardingId: string): Promise<void> {
  const actor = await requireHr();
  await completeOffboarding(actor, offboardingId);
  revalidatePath("/offboarding");
}
