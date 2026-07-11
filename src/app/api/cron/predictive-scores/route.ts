// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — 24h predictive-scoring cron. Recomputes every active employee's
// departure-risk score, writes a snapshot, and raises DEPARTURE_RISK alerts
// (score > threshold). All the work lives in the data layer; this route is just
// the SECURE boundary.
//
// AUTH: a shared secret in the `Authorization: Bearer <CRON_SECRET>` header,
// compared in constant time. This is the pattern Vercel Cron uses — when
// `CRON_SECRET` is set, Vercel sends it on scheduled invocations. We FAIL CLOSED:
// if `CRON_SECRET` is unset, every request is rejected (no unauthenticated
// company-wide scoring). Schedule lives in `vercel.json` → crons.
// ─────────────────────────────────────────────────────────────────────────
import { timingSafeEqual } from "node:crypto";
import { runDailyRiskScoring } from "@/lib/predictive/data-layer";

export const runtime = "nodejs"; // needs Prisma + node:crypto
export const dynamic = "force-dynamic"; // never cached — it mutates

/**
 * Constant-time check of the Bearer secret. Fails closed when CRON_SECRET is unset.
 * Exported for unit testing (Next only routes the GET export; this is inert to the router).
 */
export function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on differing lengths.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const summary = await runDailyRiskScoring();
    // Metadata only (counts) — no employee data in the response body.
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron] predictive-scores failed:", err);
    return new Response("Internal Error", { status: 500 });
  }
}
