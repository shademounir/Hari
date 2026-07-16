import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { builtinSubject, can } from "@/lib/rbac";
import { recordAudit, getAuditLog } from "@/lib/audit";

// SCRUM-064 — the AuditLog trail of sensitive admin actions. Reads are gated on
// `alerts:read` (Admin/HR); writes store metadata only (ids/role/action/meta),
// never names, message content, or salary.

const createdIds: string[] = [];
afterAll(async () => {
  if (createdIds.length) {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdIds } } });
  }
  await prisma.$disconnect();
});

describe("audit — RBAC gating (no DB access)", () => {
  it("only HR_ADMIN / SUPER_ADMIN can read the audit trail", () => {
    expect(can(builtinSubject("EMPLOYEE"), "alerts:read")).toBe(false);
    expect(can(builtinSubject("MANAGER"), "alerts:read")).toBe(false);
    expect(can(builtinSubject("HR_ADMIN"), "alerts:read")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "alerts:read")).toBe(true);
  });

  it("getAuditLog returns [] for roles without alerts:read (early return, no DB)", async () => {
    expect(await getAuditLog(builtinSubject("EMPLOYEE"))).toEqual([]);
    expect(await getAuditLog(builtinSubject("MANAGER"))).toEqual([]);
  });
});

describe("audit — record + read roundtrip (metadata only, no PII)", () => {
  it("records a sensitive action and reads it back for Admin/HR", async () => {
    const actor = { userId: "audit-test-actor", ...builtinSubject("SUPER_ADMIN") };
    const id = await recordAudit(actor, {
      action: "ALERT_RESOLVED",
      targetType: "Alert",
      targetId: "alert-xyz",
      alertId: "alert-xyz",
      meta: { from: "OPEN", to: "RESOLVED" },
    });
    expect(id).toBeTruthy();
    if (id) createdIds.push(id);

    const rows = await getAuditLog(builtinSubject("HR_ADMIN"), { actorId: "audit-test-actor" });
    const entry = rows.find((r) => r.id === id);
    expect(entry).toBeDefined();
    expect(entry!.action).toBe("ALERT_RESOLVED");
    expect(entry!.actorRole).toBe("SUPER_ADMIN");
    expect(entry!.targetType).toBe("Alert");
    expect(entry!.targetId).toBe("alert-xyz");
    expect(entry!.meta).toEqual({ from: "OPEN", to: "RESOLVED" });

    // No-PII contract: the persisted row is only ids/role/action/meta.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/salary|password|passwordHash/i);
  });
});
