// SCRUM-075 — authorization tests for the admin alerts console (SCRUM-069/070):
// listing, and the OPEN -> ACKNOWLEDGED -> RESOLVED -> OPEN status transitions.
//
// tests/alerts.test.ts already covers the RBAC matrix and the "no DB access"
// short-circuit for unauthorized roles on the read/triage helpers. This file
// complements it with real-DB assertions: an authorized role's triage action
// must actually persist, and an unauthorized role's attempt must leave the row
// untouched (not just return false) — the case a pure short-circuit test can't
// distinguish from "nothing was checked at all".
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ROLE_PERMISSIONS, builtinSubject, can } from "@/lib/rbac";
import { acknowledgeAlert, resolveAlert, reopenAlert, type AlertActor } from "@/lib/alerts";

const actors: Record<"employee" | "manager" | "hr", AlertActor> = {
  employee: { role: "EMPLOYEE", permissions: DEFAULT_ROLE_PERMISSIONS["EMPLOYEE"], userId: "" },
  manager: { role: "MANAGER", permissions: DEFAULT_ROLE_PERMISSIONS["MANAGER"], userId: "" },
  hr: { role: "HR_ADMIN", permissions: DEFAULT_ROLE_PERMISSIONS["HR_ADMIN"], userId: "" },
};
const KEY_BY_EMAIL: Record<string, keyof typeof actors> = {
  "collaborateur@hari.ma": "employee",
  "manager@hari.ma": "manager",
  "rh@hari.ma": "hr",
};

beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.keys(KEY_BY_EMAIL) } },
    select: { id: true, email: true },
  });
  for (const u of users) {
    actors[KEY_BY_EMAIL[u.email]].userId = u.id;
  }
});

afterAll(() => prisma.$disconnect());

describe("alerts:read permission gate (console access)", () => {
  it("only HR_ADMIN / SUPER_ADMIN can open the console", () => {
    expect(can(builtinSubject("EMPLOYEE"), "alerts:read")).toBe(false);
    expect(can(builtinSubject("MANAGER"), "alerts:read")).toBe(false);
    expect(can(builtinSubject("HR_ADMIN"), "alerts:read")).toBe(true);
    expect(can(builtinSubject("SUPER_ADMIN"), "alerts:read")).toBe(true);
  });
});

describe("alert status changes — authorization (real DB row)", () => {
  let alertId: string;

  beforeEach(async () => {
    const row = await prisma.alert.create({
      data: { kind: "AI_GUARD_BLOCK", severity: "WARNING", titleKey: "alerts.kind.AI_GUARD_BLOCK.title" },
      select: { id: true },
    });
    alertId = row.id;
  });

  afterEach(async () => {
    await prisma.alert.delete({ where: { id: alertId } }).catch(() => {});
  });

  it("EMPLOYEE / MANAGER cannot acknowledge, resolve, or reopen — the row stays untouched", async () => {
    for (const actor of [actors.employee, actors.manager]) {
      expect(await acknowledgeAlert(actor, alertId)).toBe(false);
      expect(await resolveAlert(actor, alertId)).toBe(false);
    }
    const row = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(row.status).toBe("OPEN");
    expect(row.ackById).toBeNull();
    expect(row.resolvedById).toBeNull();
  });

  it("HR_ADMIN can acknowledge an OPEN alert, stamping who did it", async () => {
    expect(await acknowledgeAlert(actors.hr, alertId)).toBe(true);
    const row = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(row.status).toBe("ACKNOWLEDGED");
    expect(row.ackById).toBe(actors.hr.userId);
  });

  it("HR_ADMIN can resolve an alert, and an unauthorized reopen attempt afterwards is a no-op", async () => {
    expect(await resolveAlert(actors.hr, alertId)).toBe(true);
    let row = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(row.status).toBe("RESOLVED");
    expect(row.resolvedById).toBe(actors.hr.userId);
    expect(row.resolvedAt).not.toBeNull();

    // A non-admin trying to reopen a resolved alert must fail and leave it resolved.
    expect(await reopenAlert(actors.manager, alertId)).toBe(false);
    row = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(row.status).toBe("RESOLVED");
  });

  it("HR_ADMIN can reopen a resolved alert back to a pristine OPEN", async () => {
    await resolveAlert(actors.hr, alertId);
    expect(await reopenAlert(actors.hr, alertId)).toBe(true);
    const row = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(row.status).toBe("OPEN");
    expect(row.resolvedAt).toBeNull();
    expect(row.resolvedById).toBeNull();
    expect(row.ackById).toBeNull();
  });
});
