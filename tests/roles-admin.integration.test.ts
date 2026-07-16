// The role editor's WRITE guardrails. The UI mirrors these (locked checkbox,
// disabled delete), but the UI is not the boundary — a hand-crafted POST hits
// these functions directly, so each rule is asserted against lib/roles itself.
//
// Needs a seeded DB (npm run db:seed).
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { builtinSubject, DEFAULT_ROLE_PERMISSIONS, type Actor } from "@/lib/rbac";
import { getRbacMatrix, invalidateRbacMatrix, permissionsForRole } from "@/lib/rbac-server";
import { createRole, deleteRole, updateRole } from "@/lib/roles";

const SLUG = "TEST_GUARD_ROLE";

const superAdmin: Actor = { userId: "test-super", ...builtinSubject("SUPER_ADMIN") };
const hr: Actor = { userId: "test-hr", ...builtinSubject("HR_ADMIN") };
const employee: Actor = { userId: "test-emp", ...builtinSubject("EMPLOYEE") };

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ["test-super", "test-hr", "test-emp"] } } });
  await prisma.role.deleteMany({ where: { slug: { in: [SLUG, "TEST_GUARD_TWO"] } } });
  // The suite shares one DB and never truncates, so put every built-in it touches
  // back on the code defaults — unconditionally, so a failure mid-test can't leave
  // MANAGER holding a stray permission for every later test (and for the dev app).
  await prisma.role.updateMany({
    where: { builtIn: true },
    data: { permissions: Prisma.DbNull },
  });
  invalidateRbacMatrix();
});
afterAll(() => prisma.$disconnect());

describe("gate: only admin:settings may manage roles", () => {
  it("refuses HR and employees — and writes nothing", async () => {
    for (const actor of [hr, employee]) {
      expect(await createRole(actor, { slug: SLUG, label: "X", permissions: [] })).toEqual({
        ok: false,
        error: "forbidden",
      });
      expect(
        await updateRole(actor, { slug: "EMPLOYEE", label: "Employee", permissions: [] }),
      ).toEqual({ ok: false, error: "forbidden" });
      expect(await deleteRole(actor, SLUG)).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await prisma.role.findUnique({ where: { slug: SLUG } })).toBeNull();
  });
});

describe("guardrail: no privilege escalation", () => {
  it("a caller cannot GRANT a permission they don't hold themselves", async () => {
    // A hypothetical narrow admin: may manage roles, but holds no payroll access.
    const narrowAdmin: Actor = {
      userId: "test-super",
      role: "NARROW_ADMIN",
      permissions: ["admin:settings", "handbook:read"],
    };
    const res = await createRole(narrowAdmin, {
      slug: SLUG,
      label: "Sneaky",
      permissions: ["salary:read:all"], // not theirs to give
    });
    expect(res).toEqual({ ok: false, error: "escalation" });
    expect(await prisma.role.findUnique({ where: { slug: SLUG } })).toBeNull();
  });

  it("...but may grant what they do hold, and may always REVOKE", async () => {
    const narrowAdmin: Actor = {
      userId: "test-super",
      role: "NARROW_ADMIN",
      permissions: ["admin:settings", "handbook:read"],
    };
    expect(
      await createRole(narrowAdmin, { slug: SLUG, label: "Fine", permissions: ["handbook:read"] }),
    ).toEqual({ ok: true, slug: SLUG });

    // Revoking is narrowing — allowed even for a permission the caller lacks.
    invalidateRbacMatrix();
    await prisma.role.update({
      where: { slug: SLUG },
      data: { permissions: ["handbook:read", "salary:read:all"] },
    });
    invalidateRbacMatrix();
    const res = await updateRole(narrowAdmin, {
      slug: SLUG,
      label: "Fine",
      permissions: ["handbook:read"], // drops salary:read:all
    });
    expect(res.ok).toBe(true);
    expect(await permissionsForRole(SLUG)).toEqual(["handbook:read"]);
  });
});

describe("guardrail: nobody can lock everyone out of settings", () => {
  it("SUPER_ADMIN cannot lose admin:settings", async () => {
    const res = await updateRole(superAdmin, {
      slug: "SUPER_ADMIN",
      label: "Super Admin",
      // Everything it has, minus the one permission that opens /settings.
      permissions: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN.filter((p) => p !== "admin:settings"),
    });
    expect(res).toEqual({ ok: false, error: "would_lock_out" });
    // Unchanged — still on the code defaults.
    expect(await permissionsForRole("SUPER_ADMIN")).toContain("admin:settings");
  });

  it("a custom admin role can be stripped while SUPER_ADMIN still holds the keys", async () => {
    // The rule is "someone active must keep admin:settings", not "no role may
    // ever lose it" — otherwise you could never undo a mistaken grant.
    await createRole(superAdmin, {
      slug: SLUG,
      label: "Temp Admin",
      permissions: ["admin:settings"],
    });
    invalidateRbacMatrix();
    const res = await updateRole(superAdmin, { slug: SLUG, label: "Temp Admin", permissions: [] });
    expect(res.ok).toBe(true);
    expect(await permissionsForRole(SLUG)).toEqual([]);
  });
});

describe("guardrail: built-ins persist, custom roles are yours", () => {
  it("a built-in cannot be deleted", async () => {
    expect(await deleteRole(superAdmin, "EMPLOYEE")).toEqual({
      ok: false,
      error: "builtin_immutable",
    });
    expect(await prisma.role.findUnique({ where: { slug: "EMPLOYEE" } })).not.toBeNull();
  });

  it("a custom role cannot shadow a built-in slug", async () => {
    expect(
      await createRole(superAdmin, { slug: "employee", label: "Fake", permissions: [] }),
    ).toEqual({ ok: false, error: "slug_taken" });
  });

  it("a role with users cannot be deleted", async () => {
    // Reassigning is the only way out, which the FK enforces regardless.
    expect(await deleteRole(superAdmin, "MANAGER")).toEqual({
      ok: false,
      error: "builtin_immutable",
    });
    await createRole(superAdmin, { slug: SLUG, label: "Held", permissions: [] });
    const victim = await prisma.user.findFirst({ where: { role: "EMPLOYEE" }, select: { id: true, role: true } });
    await prisma.user.update({ where: { id: victim!.id }, data: { role: SLUG } });
    try {
      expect(await deleteRole(superAdmin, SLUG)).toEqual({ ok: false, error: "role_in_use" });
    } finally {
      await prisma.user.update({ where: { id: victim!.id }, data: { role: victim!.role } });
    }
  });
});

describe("write path: normalization, vocabulary, audit", () => {
  it("normalizes a slug and stores only real permissions", async () => {
    const res = await createRole(superAdmin, {
      slug: "test guard two!",
      label: "  Field Auditor  ",
      permissions: ["alerts:read", "engagement:read:self", "not:a:permission", 7],
    });
    expect(res).toEqual({ ok: true, slug: "TEST_GUARD_TWO" });
    const row = await prisma.role.findUnique({ where: { slug: "TEST_GUARD_TWO" } });
    expect(row?.label).toBe("Field Auditor");
    expect(row?.builtIn).toBe(false);
    expect(row?.permissions).toEqual(["alerts:read"]);
    
  });

  it("rejects a slug that normalizes to nothing", async () => {
    expect(await createRole(superAdmin, { slug: "!!!", label: "X", permissions: [] })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("resetToDefaults writes SQL NULL so a built-in returns to the code defaults", async () => {
    await updateRole(superAdmin, {
      slug: "MANAGER",
      label: "Manager",
      permissions: ["handbook:read"], // deliberately wrong
    });
    invalidateRbacMatrix();
    expect(await permissionsForRole("MANAGER")).toEqual(["handbook:read"]);

    await updateRole(superAdmin, {
      slug: "MANAGER",
      label: "Manager",
      permissions: [],
      resetToDefaults: true,
    });
    invalidateRbacMatrix();
    // A JSON `null` would read back as "a role with no permissions"; only a SQL
    // NULL means "use the code defaults".
    const row = await prisma.role.findUnique({ where: { slug: "MANAGER" } });
    expect(row?.permissions).toBeNull();
    const matrix = await getRbacMatrix();
    expect(matrix.bySlug.MANAGER.usesDefaults).toBe(true);
    expect([...(await permissionsForRole("MANAGER"))].sort()).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.MANAGER].sort(),
    );
  });

  it("records the change on the audit trail with codes, never names", async () => {
    await createRole(superAdmin, { slug: SLUG, label: "Audited", permissions: ["handbook:read"] });
    const entry = await prisma.auditLog.findFirst({
      where: { action: "ROLE_CREATED", targetId: SLUG },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).toMatchObject({
      actorId: "test-super",
      actorRole: "SUPER_ADMIN",
      targetType: "Role",
      targetId: SLUG,
      meta: { permissions: ["handbook:read"] },
    });
    // No-PII contract: permission keys and a slug are codes, not personal data.
    expect(JSON.stringify(entry?.meta)).not.toMatch(/@|hari\.ma/);
  });
});
