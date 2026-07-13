// ─────────────────────────────────────────────────────────────────────────
// HARI-AUTH — request-side orchestration for the three email flows: password
// reset, passwordless magic link, and email OTP.
//
// Anti-enumeration: every issue* function behaves identically whether or not an
// account exists — it only creates + emails a secret when the user is real, but
// the caller always shows the same "check your email" message. Secrets are only
// surfaced to the UI in development (see email.revealSecretsInUi).
// ─────────────────────────────────────────────────────────────────────────
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createAuthToken, normalizeEmail, TOKEN_TTL_MINUTES } from "@/lib/auth/tokens";
import { sendAuthEmail, revealSecretsInUi } from "@/lib/auth/email";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Throttle auth-email issuance to stop mail-bombing a victim address and slow
// enumeration sweeps. Applied to REAL and unknown addresses alike (below), so the
// generic "check your email" response stays constant-shape regardless of outcome.
const ISSUE_MAX = 5; // per (ip,email) per window
const ISSUE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** True when this issuance should be silently dropped (over the per-pair or the
 *  looser per-ip cap). Returns a generic non-signal — never reveals the reason. */
async function issuanceThrottled(email: string): Promise<boolean> {
  let ip: string;
  try {
    ip = clientIp(await headers());
  } catch {
    // No request scope (e.g. unit tests, background jobs). Rate limiting is a
    // request-time concern — don't throttle, and don't touch the counter table.
    return false;
  }
  const [pair, perIp] = await Promise.all([
    rateLimit("auth-issue", `${ip}:${email}`, ISSUE_MAX, ISSUE_WINDOW_MS),
    rateLimit("auth-issue-ip", ip, ISSUE_MAX * 4, ISSUE_WINDOW_MS),
  ]);
  return !pair.ok || !perIp.ok;
}

/** Absolute base URL for links inside emails. These carry one-time secrets, so
 *  the origin must not come from the request Host/X-Forwarded-Host header (an
 *  attacker sets `Host: evil.com` and the victim's reset link points at them).
 *  Production requires a configured AUTH_URL and fails loudly without one; the
 *  header fallback is dev-only. */
export async function getBaseUrl(): Promise<string> {
  const fromEnv =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_URL (or NEXTAUTH_URL) must be set in production — refusing to build " +
        "secret-bearing email links from an untrusted Host header.",
    );
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** What the UI gets back — the same shape regardless of whether email was sent.
 *  `devSecret` / `devLink` are populated only in development for demoing. */
export type IssueResult = { ok: true; devSecret?: string; devLink?: string };

async function userExists(email: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return Boolean(u);
}

export async function issuePasswordReset(rawEmail: string): Promise<IssueResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: true };
  if (await issuanceThrottled(email)) return { ok: true };
  if (!(await userExists(email))) return { ok: true };
  const { secret } = await createAuthToken("PASSWORD_RESET", email);
  const base = await getBaseUrl();
  const link = `${base}/reset-password?email=${encodeURIComponent(email)}&token=${secret}`;
  await sendAuthEmail({
    to: email,
    subject: "HARI — Réinitialisation du mot de passe / Password reset",
    text:
      `Réinitialisez votre mot de passe (valide ${TOKEN_TTL_MINUTES.PASSWORD_RESET} min) :\n${link}\n\n` +
      `Reset your password (valid ${TOKEN_TTL_MINUTES.PASSWORD_RESET} min):\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
  });
  return revealSecretsInUi ? { ok: true, devLink: link } : { ok: true };
}

export async function issueMagicLink(rawEmail: string): Promise<IssueResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: true };
  if (await issuanceThrottled(email)) return { ok: true };
  if (!(await userExists(email))) return { ok: true };
  const { secret } = await createAuthToken("MAGIC_LINK", email);
  const base = await getBaseUrl();
  const link = `${base}/login/magic?email=${encodeURIComponent(email)}&token=${secret}`;
  await sendAuthEmail({
    to: email,
    subject: "HARI — Lien de connexion / Sign-in link",
    text:
      `Connectez-vous en un clic (valide ${TOKEN_TTL_MINUTES.MAGIC_LINK} min) :\n${link}\n\n` +
      `Sign in with one click (valid ${TOKEN_TTL_MINUTES.MAGIC_LINK} min):\n${link}`,
  });
  return revealSecretsInUi ? { ok: true, devLink: link } : { ok: true };
}

export async function issueEmailOtp(rawEmail: string): Promise<IssueResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: true };
  if (await issuanceThrottled(email)) return { ok: true };
  if (!(await userExists(email))) return { ok: true };
  const { secret } = await createAuthToken("EMAIL_OTP", email);
  await sendAuthEmail({
    to: email,
    subject: `HARI — Code de connexion : ${secret}`,
    text:
      `Votre code de connexion est ${secret} (valide ${TOKEN_TTL_MINUTES.EMAIL_OTP} min).\n\n` +
      `Your sign-in code is ${secret} (valid ${TOKEN_TTL_MINUTES.EMAIL_OTP} min).`,
  });
  return revealSecretsInUi ? { ok: true, devSecret: secret } : { ok: true };
}
