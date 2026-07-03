"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  bulkDecideLeaveRequests,
  decideLeaveRequest,
  resolveCaller,
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
  // resolveCaller re-resolves the Employee id from the DB rather than trusting
  // the JWT-cached `employeeId` (stale after a DB reset would write a dangling
  // approverId → FK violation). Shared with the team page so read + write agree.
  return resolveCaller(user);
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
