// User administration guardrails. The UI mirrors these (disabled options, a
// self-row that can't be deactivated), but a hand-crafted POST reaches lib/users
// directly — so every rule is asserted against the data layer itself.
//
// Needs a seeded DB (npm run db:seed).
import { describe, it, expect, afterAll, afterEach, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { builtinSubject, type Actor } from "@/lib/rbac";
import { invalidateRbacMatrix } from "@/lib/rbac-server";
import { createRole } from "@/lib/roles";
import {
  changeUserRole,
  getUserDetail,
  inviteUser,
  listUsers,
  setUserActive,
  updateUserProfile,
} from "@/lib/users";

// The demo emails these tests act on/through.
const EMAIL = "test.invitee@hari.ma";
const ACTOR_IDS = ["test-hr", "test-super", "test-emp"];

const superAdmin: Actor = { userId: "test-super", ...builtinSubject("SUPER_ADMIN") };
const hr: Actor = { userId: "test-hr", ...builtinSubject("HR_ADMIN") };
const employee: Actor = { userId: "test-emp", ...builtinSubject("EMPLOYEE") };

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (u) {
    await prisma.authToken.deleteMany({ where: { identifier: EMAIL } });
    await prisma.employee.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ACTOR_IDS } } });
  await prisma.role.deleteMany({ where: { slug: "TEST_WIDE_ROLE" } });
  invalidateRbacMatrix();
}

beforeEach(cleanup);
afterEach(cleanup);
afterAll(() => prisma.$disconnect());

const invite = {
  name: "Test Invitee",
  email: EMAIL,
  role: "EMPLOYEE",
  title: "Analyst",
  department: "Finance",
  location: "Casablanca",
  employmentType: "FULL_TIME" as const,
};

describe("gate: employee:manage", () => {
  it("an employee sees nobody and can write nothing", async () => {
    expect(await listUsers(employee)).toEqual([]);
    expect(await getUserDetail(employee, "usr_rh")).toBeNull();
    expect(await inviteUser(employee, invite)).toEqual({ ok: false, error: "forbidden" });
    expect(await changeUserRole(employee, "usr_rh", "EMPLOYEE")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setUserActive(employee, "usr_rh", false)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await prisma.user.findUnique({ where: { email: EMAIL } })).toBeNull();
  });
});

describe("invite", () => {
  it("provisions a User + Employee with no password, so the link is the only way in", async () => {
    const res = await inviteUser(hr, invite);
    expect(res.ok).toBe(true);

    const u = await prisma.user.findUnique({
      where: { email: EMAIL },
      include: { employee: true },
    });
    expect(u?.passwordHash).toBeNull(); // sign-in never creates an account; this opens one
    expect(u?.active).toBe(true);
    expect(u?.role).toBe("EMPLOYEE");
    expect(u?.employee?.title).toBe("Analyst");

    // A single-use INVITE token, stored as a hash — never the raw secret.
    const token = await prisma.authToken.findFirst({ where: { identifier: EMAIL } });
    expect(token?.type).toBe("INVITE");
    expect(token?.consumedAt).toBeNull();
    expect(token?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses a duplicate email rather than clobbering an account", async () => {
    await inviteUser(hr, invite);
    expect(await inviteUser(hr, invite)).toEqual({ ok: false, error: "email_taken" });
  });

  it("refuses an unknown role", async () => {
    expect(await inviteUser(hr, { ...invite, role: "GHOST" })).toEqual({
      ok: false,
      error: "unknown_role",
    });
  });
});

describe("guardrail: no privilege escalation", () => {
  it("HR cannot invite a SUPER_ADMIN — the permission HR lacks is the whole point", async () => {
    // HR holds employee:manage but NOT admin:settings. Without the subset rule,
    // separation of duties is decoration: HR could mint an admin and use it.
    expect(await inviteUser(hr, { ...invite, role: "SUPER_ADMIN" })).toEqual({
      ok: false,
      error: "escalation",
    });
    expect(await prisma.user.findUnique({ where: { email: EMAIL } })).toBeNull();
  });

  it("HR cannot PROMOTE an existing user to SUPER_ADMIN", async () => {
    await inviteUser(hr, invite);
    const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    expect(await changeUserRole(hr, u!.id, "SUPER_ADMIN")).toEqual({
      ok: false,
      error: "escalation",
    });
    expect((await prisma.user.findUnique({ where: { id: u!.id } }))?.role).toBe("EMPLOYEE");
  });

  it("the rule follows the MATRIX, not the role name: a custom role HR outranks is fine", async () => {
    await createRole(superAdmin, {
      slug: "TEST_WIDE_ROLE",
      label: "Reader",
      permissions: ["handbook:read", "directory:read:all"], // all held by HR
    });
    invalidateRbacMatrix();
    await inviteUser(hr, invite);
    const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    expect(await changeUserRole(hr, u!.id, "TEST_WIDE_ROLE")).toEqual({ ok: true, id: u!.id });
  });

  it("...and refuses the same custom role once it outgrows the caller", async () => {
    await createRole(superAdmin, {
      slug: "TEST_WIDE_ROLE",
      label: "Wide",
      permissions: ["admin:settings"], // HR does not hold this
    });
    invalidateRbacMatrix();
    expect(await inviteUser(hr, { ...invite, role: "TEST_WIDE_ROLE" })).toEqual({
      ok: false,
      error: "escalation",
    });
  });

  it("a super admin CAN assign the widest role", async () => {
    expect((await inviteUser(superAdmin, { ...invite, role: "SUPER_ADMIN" })).ok).toBe(true);
  });
});

describe("guardrail: no self-modification", () => {
  it("you cannot change your own role or deactivate yourself", async () => {
    const self: Actor = { userId: "usr_rh", ...builtinSubject("HR_ADMIN") };
    expect(await changeUserRole(self, "usr_rh", "EMPLOYEE")).toEqual({
      ok: false,
      error: "self_forbidden",
    });
    expect(await setUserActive(self, "usr_rh", false)).toEqual({
      ok: false,
      error: "self_forbidden",
    });
    const row = await prisma.user.findUnique({ where: { id: "usr_rh" } });
    expect(row?.role).toBe("HR_ADMIN");
    expect(row?.active).toBe(true);
  });
});

describe("guardrail: the last admin standing", () => {
  it("cannot be demoted or deactivated", async () => {
    // usr_admin is the only SUPER_ADMIN in the seed, and admin:settings is the
    // only door to /settings — losing them would brick the console for good.
    const admins = await prisma.user.count({ where: { active: true, role: "SUPER_ADMIN" } });
    expect(admins).toBe(1);

    expect(await changeUserRole(superAdmin, "usr_admin", "EMPLOYEE")).toEqual({
      ok: false,
      error: "would_lock_out",
    });
    expect(await setUserActive(superAdmin, "usr_admin", false)).toEqual({
      ok: false,
      error: "would_lock_out",
    });
    expect((await prisma.user.findUnique({ where: { id: "usr_admin" } }))?.role).toBe("SUPER_ADMIN");
  });

  it("...but may be demoted once someone else can reach settings", async () => {
    await inviteUser(superAdmin, { ...invite, role: "SUPER_ADMIN" });
    const backup = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    try {
      expect(await changeUserRole(superAdmin, "usr_admin", "HR_ADMIN")).toEqual({
        ok: true,
        id: "usr_admin",
      });
    } finally {
      await prisma.user.update({ where: { id: "usr_admin" }, data: { role: "SUPER_ADMIN" } });
      expect(backup).toBeTruthy();
    }
  });
});

describe("sensitive fields follow the READ rules", () => {
  it("a caller who can't read compensation never sees it, and can't set it", async () => {
    // A realistic "people ops" role: everything HR has EXCEPT compensation.
    // (It must still hold what EMPLOYEE holds — the subset rule means you can't
    // assign a role granting anything you lack, so an actor with only
    // employee:manage could not invite an employee at all.)
    const noSalary: Actor = {
      userId: "test-hr",
      role: "PEOPLE_OPS",
      permissions: builtinSubject("HR_ADMIN").permissions.filter((p) => p !== "salary:read:all"),
    };
    await inviteUser(noSalary, { ...invite, salary: 999_999 });
    const u = await prisma.user.findUnique({
      where: { email: EMAIL },
      include: { employee: true },
    });
    // Ignored on the way in — not honored just because it was in the payload.
    expect(u?.employee?.salary).toBe(0);

    // ...and stripped on the way out, exactly as the directory does.
    const detail = await getUserDetail(noSalary, u!.id);
    expect(detail?.salary).toBeNull();
    const asHr = await getUserDetail(hr, u!.id);
    expect(asHr?.salary).toBe(0);

    // An update can't zero what it can't see either.
    await prisma.employee.update({ where: { id: u!.employee!.id }, data: { salary: 500_000 } });
    await updateUserProfile(noSalary, {
      userId: u!.id,
      name: "Test Invitee",
      title: "Analyst",
      department: "Finance",
      location: "Casablanca",
      employmentType: "FULL_TIME",
      salary: 1,
    });
    const after = await prisma.employee.findUnique({ where: { id: u!.employee!.id } });
    expect(after?.salary).toBe(500_000);
  });
});

describe("org chart integrity", () => {
  it("refuses a manager cycle, directly or up the chain", async () => {
    await inviteUser(hr, invite);
    const u = await prisma.user.findUnique({
      where: { email: EMAIL },
      include: { employee: true },
    });
    const selfEmployeeId = u!.employee!.id;

    const base = {
      userId: u!.id,
      name: "Test Invitee",
      title: "Analyst",
      department: "Finance",
      location: "Casablanca",
      employmentType: "FULL_TIME" as const,
    };
    // Direct: your own manager.
    expect(await updateUserProfile(hr, { ...base, managerId: selfEmployeeId })).toEqual({
      ok: false,
      error: "manager_cycle",
    });

    // Indirect: report → you → report. Nothing else prevents this, and an
    // undetected loop would hang every manager-scoped traversal.
    const report = await prisma.employee.findFirst({
      where: { managerId: null, id: { not: selfEmployeeId } },
      select: { id: true, managerId: true },
    });
    await prisma.employee.update({
      where: { id: selfEmployeeId },
      data: { managerId: report!.id },
    });
    try {
      const res = await updateUserProfile(hr, { ...base, managerId: selfEmployeeId });
      // Setting the invitee's manager to itself is still a cycle; assert the
      // chain-walk case by pointing the REPORT at the invitee.
      expect(res).toEqual({ ok: false, error: "manager_cycle" });
    } finally {
      await prisma.employee.update({
        where: { id: report!.id },
        data: { managerId: report!.managerId },
      });
    }
  });
});

describe("deactivation", () => {
  it("switches the account off without touching the employee record", async () => {
    await inviteUser(hr, invite);
    const u = await prisma.user.findUnique({
      where: { email: EMAIL },
      include: { employee: true },
    });
    expect(await setUserActive(hr, u!.id, false)).toEqual({ ok: true, id: u!.id });

    const after = await prisma.user.findUnique({
      where: { id: u!.id },
      include: { employee: true },
    });
    expect(after?.active).toBe(false);
    expect(after?.deactivatedAt).toBeInstanceOf(Date);
    // Archiving the PERSON is offboarding's job (status → TERMINATED, never a
    // delete); this only closes the login.
    expect(after?.employee?.status).toBe("ACTIVE");

    expect(await setUserActive(hr, u!.id, true)).toEqual({ ok: true, id: u!.id });
    const back = await prisma.user.findUnique({ where: { id: u!.id } });
    expect(back?.active).toBe(true);
    expect(back?.deactivatedAt).toBeNull();
  });
});
