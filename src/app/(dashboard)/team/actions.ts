"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { decideLeaveRequest, type LeaveDecision } from "@/lib/hr";

// Approve/reject reuse the ONE scoped mutation in lib/hr.ts. These wrappers only
// re-establish the caller from the session (never trusting the client) and
// re-check `leave:approve` as defense in depth — the real scope enforcement
// lives in decideLeaveRequest's WHERE clause.
async function requireApprover() {
  const user = await requireUser();
  if (!can(user.role, "leave:approve")) redirect("/");
  return { role: user.role, employeeId: user.employeeId };
}

async function decide(requestId: string, decision: LeaveDecision): Promise<void> {
  const caller = await requireApprover();
  await decideLeaveRequest(caller, requestId, decision);
  revalidatePath("/team");
}

export async function approveLeaveAction(requestId: string): Promise<void> {
  await decide(requestId, "APPROVED");
}

export async function rejectLeaveAction(requestId: string): Promise<void> {
  await decide(requestId, "REJECTED");
}
