"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, type Role } from "@/lib/rbac";
import {
  bulkDecideLeaveRequests,
  decideLeaveRequest,
  type Caller,
  type LeaveDecision,
} from "@/lib/hr";
import { recordAudit } from "@/lib/audit";

// Results are returned (not just void) so the optimistic client island can toast
// success vs failure and roll back removed rows. Scope + authorization stay here
// and in lib/hr.ts — the client only sends opaque ids and a note string.
export type DecideResult = { ok: boolean };
export type BulkResult = { ok: boolean; count: number };

type Approver = { caller: Caller; userId: string; role: Role };

async function requireApprover(): Promise<Approver> {
  const user = await requireUser();
  if (!can(user, "leave:approve")) redirect("/");
  const caller: Caller = user;
  return { caller, userId: user.id, role: user.role };
}

// SCRUM-100: a leave decision is a significant HR action — record it on the audit
// trail (metadata only: request id + decision, never the reason text or names).
const leaveAction = (decision: LeaveDecision) =>
  decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED";

export async function approveLeaveAction(requestId: string): Promise<DecideResult> {
  const { caller, userId, role } = await requireApprover();
  const ok = await decideLeaveRequest(caller, requestId, "APPROVED");
  if (ok) {
    await recordAudit(
      { userId, role },
      { action: "LEAVE_APPROVED", targetType: "LeaveRequest", targetId: requestId },
    );
    revalidatePath("/team");
  }
  return { ok };
}

export async function rejectLeaveAction(requestId: string, note: string): Promise<DecideResult> {
  const { caller, userId, role } = await requireApprover();
  // A rejection MUST carry a reason — enforced client-side and re-checked here.
  if (!note?.trim()) return { ok: false };
  const ok = await decideLeaveRequest(caller, requestId, "REJECTED", note);
  if (ok) {
    await recordAudit(
      { userId, role },
      { action: "LEAVE_REJECTED", targetType: "LeaveRequest", targetId: requestId },
    );
    revalidatePath("/team");
  }
  return { ok };
}

export async function bulkDecideAction(
  ids: string[],
  decision: LeaveDecision,
  note?: string,
): Promise<BulkResult> {
  const { caller, userId, role } = await requireApprover();
  if (decision === "REJECTED" && !note?.trim()) return { ok: false, count: 0 };
  const count = await bulkDecideLeaveRequests(caller, ids, decision, note);
  if (count > 0) {
    await recordAudit(
      { userId, role },
      { action: leaveAction(decision), targetType: "LeaveRequest", meta: { count } },
    );
    revalidatePath("/team");
  }
  return { ok: count > 0, count };
}
