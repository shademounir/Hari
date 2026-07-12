// ─────────────────────────────────────────────────────────────────────────
// HARI-AUTH — auth email delivery.
//
// This starter ships WITHOUT a bundled mail transport (keeps the default build
// dependency-free and CI reproducible). Messages are written to the server log,
// so every flow — password reset, magic link, OTP — works end-to-end in dev and
// on any host whose logs you can read.
//
// To send real email in production, implement a transport in `deliver()` below
// behind your provider's env vars (SMTP / Resend / SES). Nothing else changes.
// ─────────────────────────────────────────────────────────────────────────

export type AuthEmail = { to: string; subject: string; text: string };

const isProd = process.env.NODE_ENV === "production";

/**
 * In non-production we may surface the secret/link directly in the UI so the
 * flow is demoable without a mail server. This is OFF in production and can be
 * disabled anywhere with AUTH_REVEAL_DEV_SECRETS=false.
 */
export const revealSecretsInUi =
  !isProd && process.env.AUTH_REVEAL_DEV_SECRETS !== "false";

async function deliver(msg: AuthEmail): Promise<void> {
  // ── Plug real email in here (SMTP / Resend / SES), e.g.:
  //   if (process.env.RESEND_API_KEY) { await resend.emails.send(...); return; }
  console.info(
    [`[auth-email] to=${msg.to}`, `subject: ${msg.subject}`, msg.text].join("\n  "),
  );
}

/** Best-effort send — never throws into the caller (a failed email must not
 *  reveal whether an account exists, nor break the request). */
export async function sendAuthEmail(msg: AuthEmail): Promise<void> {
  try {
    await deliver(msg);
  } catch (err) {
    console.error("[auth-email] delivery failed:", err);
  }
}
