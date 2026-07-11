// ─────────────────────────────────────────────────────────────────────────
// SCRUM-099 — 24h engagement-scoring cron. Recomputes every active employee's
// engagement score (EMA-smoothed), writes a snapshot, and raises ENGAGEMENT_RISK
// alerts for ORANGE/RED bands (confidence-gated). All the work lives in the data
// layer; this route is just the SECURE boundary.
//
// AUTH: a shared secret in the `Authorization: Bearer <CRON_SECRET>` header,
// compared in constant time — the same pattern as the departure-risk cron. When
// `CRON_SECRET` is set, Vercel Cron sends it on scheduled invocations. We FAIL
// CLOSED: if `CRON_SECRET` is unset, every request is rejected. Schedule lives in
// `vercel.json` → crons.
// ─────────────────────────────────────────────────────────────────────────
import { timingSafeEqual } from "node:crypto";
import { runDailyEngagementScoring } from "@/lib/engagement/data-layer";

export const runtime = "nodejs"; // needs Prisma + node:crypto
export const dynamic = "force-dynamic"; // never cached — it mutates

/** Constant-time check of the Bearer secret. Fails closed when CRON_SECRET is unset. */
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on differing lengths.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const summary = await runDailyEngagementScoring();
    // Metadata only (counts) — no employee data in the response body.
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron] engagement-scores failed:", err);
    return new Response("Internal Error", { status: 500 });
  }
}

// Vercel Cron triggers with GET; POST is accepted too so a manual `curl -X POST`
// (or a webhook) doesn't 405. Both go through the same Bearer-secret gate.
export const GET = handle;
export const POST = handle;
