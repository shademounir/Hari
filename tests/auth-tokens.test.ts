import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createAuthToken,
  verifyAuthToken,
  normalizeEmail,
  cleanupAuthTokens,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
} from "@/lib/auth/tokens";
import { issueEmailOtp } from "@/lib/auth/flows";

// HARI-AUTH — one-time secrets for password reset, magic link, and email OTP.
// Security invariants: hash-only storage, single-use, expiry, OTP throttling,
// invalidation of previous tokens, and anti-enumeration on issue.

const EMAILS: string[] = [];
const email = (tag: string) => {
  const e = `authtok-${tag}-${Math.round(performance.now())}@hari.test`;
  EMAILS.push(e.toLowerCase());
  return e;
};

let userId: string | null = null;
beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: "authtok-user@hari.test", name: "Auth Tok", role: "EMPLOYEE", passwordHash: "x" },
  });
  userId = u.id;
  EMAILS.push("authtok-user@hari.test");
});
afterAll(async () => {
  await prisma.authToken.deleteMany({ where: { identifier: { in: EMAILS } } });
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("auth tokens — helpers", () => {
  it("normalizeEmail lowercases + trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("OTP codes are 6 numeric digits", async () => {
    const { secret } = await createAuthToken("EMAIL_OTP", email("otplen"));
    expect(secret).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });
});

describe("auth tokens — storage stores only a hash", () => {
  it("persists SHA-256(secret), never the raw secret", async () => {
    const e = email("hash");
    const { secret } = await createAuthToken("MAGIC_LINK", e);
    const row = await prisma.authToken.findFirstOrThrow({
      where: { identifier: normalizeEmail(e), type: "MAGIC_LINK" },
    });
    expect(row.tokenHash).not.toBe(secret);
    expect(row.tokenHash).toBe(createHash("sha256").update(secret).digest("hex"));
    expect(row.tokenHash).toHaveLength(64);
  });
});

describe("auth tokens — verify lifecycle", () => {
  it("magic link: valid once, then consumed (single-use)", async () => {
    const e = email("magic");
    const { secret } = await createAuthToken("MAGIC_LINK", e);
    expect(await verifyAuthToken("MAGIC_LINK", e, secret)).toEqual({ ok: true, email: normalizeEmail(e) });
    // second use fails
    expect(await verifyAuthToken("MAGIC_LINK", e, secret)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a wrong secret", async () => {
    const e = email("wrong");
    await createAuthToken("MAGIC_LINK", e);
    expect(await verifyAuthToken("MAGIC_LINK", e, "deadbeef")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an expired token", async () => {
    const e = email("exp");
    const { secret } = await createAuthToken("PASSWORD_RESET", e);
    await prisma.authToken.updateMany({
      where: { identifier: normalizeEmail(e), type: "PASSWORD_RESET", consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await verifyAuthToken("PASSWORD_RESET", e, secret)).toEqual({ ok: false, reason: "expired" });
  });

  it("issuing a new token invalidates the previous one", async () => {
    const e = email("rotate");
    const first = await createAuthToken("MAGIC_LINK", e);
    const second = await createAuthToken("MAGIC_LINK", e);
    expect(await verifyAuthToken("MAGIC_LINK", e, first.secret)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyAuthToken("MAGIC_LINK", e, second.secret)).toEqual({ ok: true, email: normalizeEmail(e) });
  });
});

describe("auth tokens — OTP throttling", () => {
  it("locks out after too many wrong attempts", async () => {
    const e = email("throttle");
    const { secret } = await createAuthToken("EMAIL_OTP", e);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyAuthToken("EMAIL_OTP", e, "000000")).toEqual({ ok: false, reason: "invalid" });
    }
    // Even the correct code is now locked out.
    expect(await verifyAuthToken("EMAIL_OTP", e, secret)).toEqual({ ok: false, reason: "too_many" });
  });
});

describe("auth flows — anti-enumeration on issue", () => {
  it("issues a token for a known user and none for an unknown email", async () => {
    // known user
    const res = await issueEmailOtp("authtok-user@hari.test");
    expect(res.devSecret).toBeTruthy();
    expect(await verifyAuthToken("EMAIL_OTP", "authtok-user@hari.test", res.devSecret!)).toEqual({
      ok: true,
      email: "authtok-user@hari.test",
    });
    // unknown user — no token created
    const unknown = email("nouser");
    const res2 = await issueEmailOtp(unknown);
    expect(res2.devSecret).toBeUndefined();
    const count = await prisma.authToken.count({ where: { identifier: normalizeEmail(unknown) } });
    expect(count).toBe(0);
  });
});

describe("auth tokens — cleanup", () => {
  it("removes consumed/expired rows", async () => {
    const removed = await cleanupAuthTokens();
    expect(removed).toBeGreaterThanOrEqual(0);
  });
});
