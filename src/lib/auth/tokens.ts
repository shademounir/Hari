// ─────────────────────────────────────────────────────────────────────────
// HARI-AUTH — one-time secrets backing password reset, passwordless magic
// links, and email OTP codes.
//
// Security model:
//  • Only a SHA-256 HASH of the secret is persisted — a DB leak can't be replayed.
//  • Secrets are single-use (consumedAt) and short-lived (per-type TTL).
//  • Issuing a new token of a kind invalidates the previous live one for that
//    email, so only the most recent link/code works.
//  • OTP codes are throttled (OTP_MAX_ATTEMPTS) to resist brute force; link
//    tokens are 256-bit so guessing is infeasible.
//  • Hash comparison is constant-time.
//
// This module is pure data-access + crypto (no email, no network) so it is fully
// covered by the deterministic test suite.
// ─────────────────────────────────────────────────────────────────────────
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** How long each secret stays valid, in minutes. */
export const TOKEN_TTL_MINUTES: Record<AuthTokenType, number> = {
  PASSWORD_RESET: 30,
  MAGIC_LINK: 15,
  EMAIL_OTP: 10,
  // An invited account's first-password link. Far longer than a reset: the
  // recipient isn't waiting at their desk when HR provisions them, and a
  // same-day expiry would just mean re-inviting everyone hired on a Friday.
  INVITE: 60 * 24 * 7, // 7 days
};

export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS = 5;

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Lowercase + trim — the single canonical form for an email identifier. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function generateSecret(type: AuthTokenType): string {
  if (type === "EMAIL_OTP") {
    // Uniform 6-digit numeric code, zero-padded.
    const n = randomBytes(4).readUInt32BE(0) % 10 ** OTP_LENGTH;
    return String(n).padStart(OTP_LENGTH, "0");
  }
  // 256-bit link token → 64 hex chars.
  return randomBytes(32).toString("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Mint a fresh secret for `email`, invalidating any previous live token of the
 * same `type`. Returns the RAW secret (shown once — emailed, never stored) and
 * its expiry. The caller is responsible for delivering it.
 */
export async function createAuthToken(
  type: AuthTokenType,
  email: string,
): Promise<{ secret: string; expiresAt: Date }> {
  const identifier = normalizeEmail(email);
  await prisma.authToken.updateMany({
    where: { type, identifier, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const secret = generateSecret(type);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[type] * 60_000);
  await prisma.authToken.create({
    data: { type, identifier, tokenHash: sha256(secret), expiresAt },
  });
  return { secret, expiresAt };
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many" };

/**
 * Verify a secret for `email`. On success the token is consumed (single-use) and
 * the normalized email is returned. On an OTP mismatch the attempt counter is
 * incremented; after OTP_MAX_ATTEMPTS the code is locked out ("too_many").
 */
export async function verifyAuthToken(
  type: AuthTokenType,
  email: string,
  secret: string,
): Promise<VerifyResult> {
  const identifier = normalizeEmail(email);
  const raw = String(secret ?? "");
  if (!identifier || !raw) return { ok: false, reason: "invalid" };

  const row = await prisma.authToken.findFirst({
    where: { type, identifier, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (type === "EMAIL_OTP" && row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many" };
  }

  if (!constantTimeEqualHex(row.tokenHash, sha256(raw))) {
    if (type === "EMAIL_OTP") {
      await prisma.authToken.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
    }
    return { ok: false, reason: "invalid" };
  }

  await prisma.authToken.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true, email: identifier };
}

/** Best-effort housekeeping: drop consumed/expired rows. Safe to call anytime. */
export async function cleanupAuthTokens(): Promise<number> {
  const { count } = await prisma.authToken.deleteMany({
    where: {
      OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });
  return count;
}
