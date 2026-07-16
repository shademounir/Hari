// Self-service profile (profile:edit:self). Needs a seeded DB.
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { builtinSubject, type Actor } from "@/lib/rbac";
import { getOwnProfile, updateOwnProfile } from "@/lib/profile";

const SELF = "usr_collaborateur"; // the seeded demo employee
const me: Actor = { userId: SELF, ...builtinSubject("EMPLOYEE") };

afterEach(async () => {
  const u = await prisma.user.findUnique({ where: { id: SELF }, select: { employee: { select: { id: true } } } });
  await prisma.user.update({ where: { id: SELF }, data: { name: "Imane Chraibi" } });
  if (u?.employee) {
    await prisma.employee.update({ where: { id: u.employee.id }, data: { avatarUrl: null } });
  }
});
afterAll(() => prisma.$disconnect());

describe("gate", () => {
  it("a subject without profile:edit:self cannot write", async () => {
    // The permission is granted to every built-in by default, but it IS revocable
    // in the role editor — so the gate has to be real.
    const revoked: Actor = { userId: SELF, role: "LOCKED", permissions: [] };
    expect(await updateOwnProfile(revoked, { name: "Nope", avatarUrl: null })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await prisma.user.findUnique({ where: { id: SELF } }))?.name).toBe("Imane Chraibi");
  });
});

describe("identity comes from the session, never the input", () => {
  it("writes only the caller's own row", async () => {
    // There is no userId parameter to pass — a "self" action takes no id, so
    // there is nothing to tamper with (authorization-invariants.md, invariant #1).
    expect(await updateOwnProfile(me, { name: "Imane C.", avatarUrl: null })).toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: SELF } }))?.name).toBe("Imane C.");
    // Nobody else moved.
    expect((await prisma.user.findUnique({ where: { id: "usr_rh" } }))?.name).toBe("Nadia Benali");
  });

  it("rejects a blank name rather than erasing it", async () => {
    expect(await updateOwnProfile(me, { name: "   ", avatarUrl: null })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("the avatar URL is not a free-text field", () => {
  it("only accepts a path our own upload route minted", async () => {
    // Otherwise this is an <img src> sink pointed at every colleague who opens
    // the directory: an off-site URL would leak their IP to a third party, and a
    // javascript:/data: one is worse.
    for (const bad of [
      "https://evil.example/track.png",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "/api/kb/images/covers/not-an-avatar.webp", // right shape, wrong prefix
      "../../etc/passwd",
    ]) {
      expect(await updateOwnProfile(me, { name: "Imane Chraibi", avatarUrl: bad })).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    const u = await prisma.user.findUnique({
      where: { id: SELF },
      select: { employee: { select: { avatarUrl: true } } },
    });
    expect(u?.employee?.avatarUrl).toBeNull();
  });

  it("accepts one from our own proxy, and clears it again", async () => {
    const url = "/api/avatars/avatars/11111111-2222-3333-4444-555555555555.webp";
    expect(await updateOwnProfile(me, { name: "Imane Chraibi", avatarUrl: url })).toEqual({
      ok: true,
    });
    expect((await getOwnProfile(me))?.avatarUrl).toBe(url);

    expect(await updateOwnProfile(me, { name: "Imane Chraibi", avatarUrl: null })).toEqual({
      ok: true,
    });
    expect((await getOwnProfile(me))?.avatarUrl).toBeNull();
  });
});

describe("getOwnProfile", () => {
  it("returns the HR-controlled facts the page shows read-only", async () => {
    const p = await getOwnProfile(me);
    expect(p?.email).toBe("collaborateur@hari.ma");
    // Present so you can check them — the page renders them as facts, not fields,
    // because rewriting your own title or manager would corrupt the org chart.
    expect(p?.title).toBeTruthy();
    expect(p?.department).toBeTruthy();
    expect(p?.managerName).toBeTruthy();
  });
});
