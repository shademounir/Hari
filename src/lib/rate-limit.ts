// ─────────────────────────────────────────────────────────────────────────
// Postgres-backed rate limiter for abuse-prone endpoints (login, auth-email
// issuance, chat, KB upload/search). Counters are bucketed per fixed window, but
// the verdict uses a WEIGHTED SLIDING WINDOW (current window + a decaying slice of
// the previous one), so a caller can't burst 2× by straddling a window boundary.
//
// Best-effort: FAILS OPEN on any DB error by default, since RBAC/auth are the real
// guardrails. Endpoints whose failure is externally visible (e.g. issuing emails)
// can opt into `failClosed` so a DB blip can't be turned into an email flood.
// Stale rows are harmless; prune with a cron if you like.
// ─────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";

export type RateLimitResult = { ok: boolean; count: number; limit: number };
export type RateLimitOpts = { failClosed?: boolean };

function windowStartFor(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}
function prevWindowStartFor(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs - windowMs);
}

/**
 * Weighted sliding-window estimate: the whole current-window count plus the part
 * of the previous window still inside the trailing `windowMs`. At the start of a
 * window the previous count counts fully; by the end it has decayed to ~0.
 */
function slidingEstimate(now: number, windowMs: number, cur: number, prev: number): number {
  const elapsed = (now - Math.floor(now / windowMs) * windowMs) / windowMs; // 0..1
  return cur + prev * (1 - elapsed);
}

/** Verdict on DB failure — fail open (allow) unless the caller opted into fail-closed. */
function onError(err: unknown, limit: number, opts?: RateLimitOpts): RateLimitResult {
  console.error(`[rate-limit] failing ${opts?.failClosed ? "CLOSED" : "open"}:`, err);
  return opts?.failClosed ? { ok: false, count: limit, limit } : { ok: true, count: 0, limit };
}

/**
 * Read the current sliding-window estimate WITHOUT incrementing. Use to reject a
 * request BEFORE doing expensive work (e.g. bcrypt) when a caller is already over
 * the limit.
 */
export async function rateLimitPeek(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
  opts?: RateLimitOpts,
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const [curRow, prevRow] = await Promise.all([
      prisma.rateLimit.findUnique({
        where: { bucket_key_windowStart: { bucket, key, windowStart: windowStartFor(now, windowMs) } },
        select: { count: true },
      }),
      prisma.rateLimit.findUnique({
        where: { bucket_key_windowStart: { bucket, key, windowStart: prevWindowStartFor(now, windowMs) } },
        select: { count: true },
      }),
    ]);
    const est = slidingEstimate(now, windowMs, curRow?.count ?? 0, prevRow?.count ?? 0);
    return { ok: est < limit, count: Math.round(est), limit };
  } catch (err) {
    return onError(err, limit, opts);
  }
}

/**
 * Increment the current window's counter for (bucket, key) and report whether the
 * sliding-window estimate is now over the limit (`ok:false`).
 */
export async function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
  opts?: RateLimitOpts,
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const windowStart = windowStartFor(now, windowMs);
    const [row, prevRow] = await Promise.all([
      prisma.rateLimit.upsert({
        where: { bucket_key_windowStart: { bucket, key, windowStart } },
        create: { bucket, key, windowStart, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      }),
      prisma.rateLimit.findUnique({
        where: { bucket_key_windowStart: { bucket, key, windowStart: prevWindowStartFor(now, windowMs) } },
        select: { count: true },
      }),
    ]);
    const est = slidingEstimate(now, windowMs, row.count, prevRow?.count ?? 0);
    return { ok: est <= limit, count: Math.round(est), limit };
  } catch (err) {
    return onError(err, limit, opts);
  }
}

/** Best-effort client IP: first hop of X-Forwarded-For, else X-Real-IP, else a
 *  constant so the key still throttles per-identifier when no IP is available.
 *  NOTE: X-Forwarded-For is client-spoofable unless a trusted proxy overwrites it;
 *  IP-keyed limits are therefore a coarse layer only — pair them with an
 *  identity-keyed limit (e.g. per-email) for anything security-sensitive. */
export function clientIp(headers: Headers | null | undefined): string {
  if (!headers) return "unknown";
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
