// ─────────────────────────────────────────────────────────────────────────
// Postgres-backed fixed-window rate limiter for abuse-prone endpoints (login,
// auth-email issuance, chat, KB upload/search). One counter row per (bucket,
// key) per window; each hit upserts +1. Coarse and best-effort — it FAILS OPEN
// on any DB error, since RBAC/auth are the real guardrails. Stale rows are
// harmless; prune with a cron if you like.
// ─────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";

export type RateLimitResult = { ok: boolean; count: number; limit: number };

function windowStartFor(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/**
 * Read the current count in the active window WITHOUT incrementing. Use to reject
 * a request BEFORE doing expensive work (e.g. bcrypt) when a caller is already
 * over the limit. Fails open (ok:true) on any error.
 */
export async function rateLimitPeek(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    const windowStart = windowStartFor(Date.now(), windowMs);
    const row = await prisma.rateLimit.findUnique({
      where: { bucket_key_windowStart: { bucket, key, windowStart } },
      select: { count: true },
    });
    const count = row?.count ?? 0;
    return { ok: count < limit, count, limit };
  } catch (err) {
    console.error("[rate-limit] peek failed (failing open):", err);
    return { ok: true, count: 0, limit };
  }
}

/**
 * Increment the active window's counter for (bucket, key) and report whether the
 * limit is now exceeded (`ok:false` once count > limit). Fails open on any error.
 */
export async function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    const windowStart = windowStartFor(Date.now(), windowMs);
    const row = await prisma.rateLimit.upsert({
      where: { bucket_key_windowStart: { bucket, key, windowStart } },
      create: { bucket, key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return { ok: row.count <= limit, count: row.count, limit };
  } catch (err) {
    console.error("[rate-limit] hit failed (failing open):", err);
    return { ok: true, count: 0, limit };
  }
}

/** Best-effort client IP: first hop of X-Forwarded-For, else X-Real-IP, else a
 *  constant so the key still throttles per-identifier when no IP is available. */
export function clientIp(headers: Headers | null | undefined): string {
  if (!headers) return "unknown";
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
