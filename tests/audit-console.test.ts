import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  recordAudit,
  getAuditLog,
  AUDIT_ACTIONS,
  asAuditAction,
} from "@/lib/audit";

// SCRUM-100 — the centralized audit console reads through getAuditLog (gated on
// alerts:read) and filters by action. These tests cover the new action set, the
// searchParam coercion, and filtered read-back.

const ACTOR = "audit-console-test-actor";
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: ACTOR } });
  await prisma.$disconnect();
});

describe("audit console — action catalogue + coercion", () => {
  it("exposes the extended action set including the SCRUM-100 additions", () => {
    for (const a of [
      "ALERT_RESOLVED",
      "OFFBOARDING_INITIATED",
      "EMPLOYEE_OFFBOARDED",
      "LEAVE_APPROVED",
      "LEAVE_REJECTED",
      "AUDIT_CONSOLE_VIEWED",
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
    }
  });

  it("asAuditAction narrows valid codes and rejects junk", () => {
    expect(asAuditAction("LEAVE_APPROVED")).toBe("LEAVE_APPROVED");
    expect(asAuditAction("not_a_real_action")).toBeUndefined();
    expect(asAuditAction(null)).toBeUndefined();
    expect(asAuditAction(undefined)).toBeUndefined();
  });
});

describe("audit console — filtered read-back (metadata only)", () => {
  it("records new-action entries and filters by action for Admin/HR", async () => {
    const actor = { userId: ACTOR, role: "HR_ADMIN" as const };
    const approvedId = await recordAudit(actor, {
      action: "LEAVE_APPROVED",
      targetType: "LeaveRequest",
      targetId: "leave-abc",
    });
    const viewedId = await recordAudit(actor, {
      action: "AUDIT_CONSOLE_VIEWED",
      meta: { filter: "ALL" },
    });
    expect(approvedId).toBeTruthy();
    expect(viewedId).toBeTruthy();

    // Filtering by action returns only that action, for this actor.
    const approvals = await getAuditLog(
      { role: "SUPER_ADMIN" },
      { action: "LEAVE_APPROVED", actorId: ACTOR },
    );
    expect(approvals.length).toBeGreaterThanOrEqual(1);
    expect(approvals.every((e) => e.action === "LEAVE_APPROVED")).toBe(true);

    const views = await getAuditLog(
      { role: "HR_ADMIN" },
      { action: "AUDIT_CONSOLE_VIEWED", actorId: ACTOR },
    );
    expect(views.some((e) => e.id === viewedId)).toBe(true);

    // No-PII contract holds for the new actions too.
    expect(JSON.stringify(approvals)).not.toMatch(/salary|password/i);
  });

  it("stays gated: non-privileged roles read nothing", async () => {
    expect(await getAuditLog({ role: "EMPLOYEE" }, { action: "LEAVE_APPROVED" })).toEqual([]);
    expect(await getAuditLog({ role: "MANAGER" })).toEqual([]);
  });
});
