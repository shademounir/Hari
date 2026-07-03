"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  bulkDecideLeaveRequests,
  decideLeaveRequest,
  type Caller,
  type LeaveDecision,
} from "@/lib/hr";

// Results are returned (not just void) so the optimistic client island can toast
// success vs failure and roll back removed rows. Scope + authorization stay here
// and in lib/hr.ts — the client only sends opaque ids and a note string.
export type DecideResult = { ok: boolean };
export type BulkResult = { ok: boolean; count: number };

async function requireApprover(): Promise<Caller> {
  const user = await requireUser();
  if (!can(user.role, "leave:approve")) redirect("/");
  // Re-resolve the Employee id from the authenticated user rather than trusting
  // the JWT-cached `employeeId`: the session token caches it at login, so after a
  // DB reset (or any employee-row change) the cached id can be stale and would
  // write a dangling `approverId` → LeaveRequest_approverId_fkey violation. The
  // `userId` unique lookup always yields the current, valid Employee id (or null,
  // which the mutation guards).
  const employee = await prisma.employee.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  return { role: user.role, employeeId: employee?.id ?? null };
}

export async function approveLeaveAction(requestId: string): Promise<DecideResult> {
  const caller = await requireApprover();
  const ok = await decideLeaveRequest(caller, requestId, "APPROVED");
  if (ok) revalidatePath("/team");
  return { ok };
}

export async function rejectLeaveAction(requestId: string, note: string): Promise<DecideResult> {
  const caller = await requireApprover();
  // A rejection MUST carry a reason — enforced client-side and re-checked here.
  if (!note?.trim()) return { ok: false };
  const ok = await decideLeaveRequest(caller, requestId, "REJECTED", note);
  if (ok) revalidatePath("/team");
  return { ok };
}

export async function bulkDecideAction(
  ids: string[],
  decision: LeaveDecision,
  note?: string,
): Promise<BulkResult> {
  const caller = await requireApprover();
  if (decision === "REJECTED" && !note?.trim()) return { ok: false, count: 0 };
  const count = await bulkDecideLeaveRequests(caller, ids, decision, note);
  if (count > 0) revalidatePath("/team");
  return { ok: count > 0, count };
}
