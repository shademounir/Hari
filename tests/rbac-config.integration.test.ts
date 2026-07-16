// The EFFECTIVE matrix: how a `Role` row resolves into the permission set that
// actually gates the app. tests/rbac.test.ts covers the built-in defaults this
// falls back to; this covers the resolution itself, which is the new trust
// boundary — every DB-sourced permission passes through here.
//
// Needs a seeded DB (npm run db:seed) for the four built-in Role rows the
// migration inserts.
import { describe, it, expect, afterAll, afterEach, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "@/lib/rbac";
import {
  getRbacMatrix,
  invalidateRbacMatrix,
  permissionsForRole,
  subjectForRole,
} from "@/lib/rbac-server";
import { toolsForSubject } from "@/lib/ai/tools";

const CUSTOM = "TEST_AUDITOR";

// The resolver memoizes the matrix for ~30s across requests, so every test here
// drops the memo after touching the table — otherwise a later read would serve
// the previous test's roles.
beforeEach(() => invalidateRbacMatrix());
afterEach(async () => {
  await prisma.role.deleteMany({ where: { slug: CUSTOM } });
  invalidateRbacMatrix();
});
afterAll(() => prisma.$disconnect());

async function createCustomRole(permissions: unknown) {
  await prisma.role.create({
    data: {
      slug: CUSTOM,
      label: "Test Auditor",
      builtIn: false,
      rank: 99,
      permissions: permissions as never,
    },
  });
  invalidateRbacMatrix();
}

describe("effective matrix resolution", () => {
  it("a built-in with permissions = NULL resolves to the code defaults", async () => {
    // This is what the migration seeds, and what keeps lib/rbac.ts the single
    // source of truth for the shipped matrix.
    const row = await prisma.role.findUnique({ where: { slug: "MANAGER" } });
    expect(row?.permissions).toBeNull();

    const matrix = await getRbacMatrix();
    const manager = matrix.bySlug.MANAGER;
    expect(manager.usesDefaults).toBe(true);
    expect([...manager.permissions].sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS.MANAGER].sort());
  });

  it("an unknown role slug resolves to NO permissions — never the defaults", async () => {
    // Fail closed. A user pointing at a role that no longer exists must lose
    // access, not silently inherit EMPLOYEE's (or anyone's) permissions.
    expect(await permissionsForRole("NOPE_NOT_A_ROLE")).toEqual([]);
    const subject = await subjectForRole("NOPE_NOT_A_ROLE");
    expect(toolsForSubject(subject)).toEqual([
      // Only the ungated utility tools survive — nothing that reads HR data.
      "getCurrentDateTime",
      "getDateInfo",
      "businessDaysBetween",
      "endConversation",
    ]);
  });

  it("a custom role holds exactly what its row lists", async () => {
    await createCustomRole(["handbook:read", "directory:read:self"]);
    const perms = await permissionsForRole(CUSTOM);
    expect([...perms].sort()).toEqual(["directory:read:self", "handbook:read"]);
  });

  it("drops permission strings the code does not enforce", async () => {
    // The closed-vocabulary guarantee, end to end: a row can name anything, but
    // only strings in PERMISSIONS survive. This is what makes it impossible to
    // grant `engagement:read:self` — the permission the app must never have.
    await createCustomRole([
      "handbook:read",
      "engagement:read:self", // the forbidden one
      "admin:everything", // never existed
      "kb:manage ", // trailing space — not an exact match
      42, // not even a string
      null,
    ]);
    expect(await permissionsForRole(CUSTOM)).toEqual(["handbook:read"]);
  });

  it("de-duplicates a repeated permission", async () => {
    await createCustomRole(["handbook:read", "handbook:read"]);
    expect(await permissionsForRole(CUSTOM)).toEqual(["handbook:read"]);
  });

  it("a custom role with a malformed permissions column holds nothing", async () => {
    // Not an array → fail closed, rather than throwing on every request or
    // falling back to a default the admin never chose.
    await createCustomRole({ oops: true });
    expect(await permissionsForRole(CUSTOM)).toEqual([]);
    await prisma.role.update({ where: { slug: CUSTOM }, data: { permissions: undefined } });
  });

  it("a CUSTOM role gets the AI tools its permissions earn — the boundary is the matrix, not the role name", async () => {
    // invariant #3: buildHrTools advertises per permission. A role invented at
    // runtime must reach exactly the tools it holds — no more (it isn't HR) and
    // no less (nothing is hardcoded to the four built-in slugs).
    await createCustomRole(["leave:approve", "handbook:read"]);
    const tools = toolsForSubject(await subjectForRole(CUSTOM));
    expect(tools).toContain("approveLeave");
    expect(tools).toContain("listPendingApprovals");
    expect(tools).toContain("searchHandbook");
    // Never advertised: it holds neither payslip nor prediction permissions.
    expect(tools).not.toContain("getPayslip");
    expect(tools).not.toContain("predictDepartures");
    expect(tools).not.toContain("getEngagementRisk");
  });

  it("revoking a permission stops advertising its tools", async () => {
    await createCustomRole(["leave:approve"]);
    expect(toolsForSubject(await subjectForRole(CUSTOM))).toContain("approveLeave");

    await prisma.role.update({ where: { slug: CUSTOM }, data: { permissions: [] } });
    invalidateRbacMatrix();
    expect(toolsForSubject(await subjectForRole(CUSTOM))).not.toContain("approveLeave");
  });

  it("every built-in is present and marked as such", async () => {
    const matrix = await getRbacMatrix();
    for (const slug of ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const) {
      expect(matrix.bySlug[slug]?.builtIn).toBe(true);
    }
    // Ordered by rank, so the UI columns read least → most privileged.
    const builtins = matrix.roles.filter((r) => r.builtIn).map((r) => r.slug);
    expect(builtins).toEqual(["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"]);
  });
});

describe("role deletion is guarded by the database, not just the UI", () => {
  it("a role with users assigned cannot be deleted", async () => {
    // ON DELETE RESTRICT: "reassign the users first" is a schema guarantee, so a
    // missed check in a server action still can't orphan a user onto a dead role.
    const assigned = await prisma.user.count({ where: { role: "EMPLOYEE" } });
    expect(assigned).toBeGreaterThan(0);
    await expect(prisma.role.delete({ where: { slug: "EMPLOYEE" } })).rejects.toThrow();
  });

  it("an unassigned custom role can be deleted", async () => {
    await createCustomRole(["handbook:read"] satisfies Permission[]);
    expect(await prisma.user.count({ where: { role: CUSTOM } })).toBe(0);
    await expect(prisma.role.delete({ where: { slug: CUSTOM } })).resolves.toBeTruthy();
  });

  it("a user cannot be assigned a role that does not exist", async () => {
    const victim = await prisma.user.findFirst({ where: { role: "EMPLOYEE" }, select: { id: true } });
    await expect(
      prisma.user.update({ where: { id: victim!.id }, data: { role: "GHOST_ROLE" } }),
    ).rejects.toThrow();
  });
});
