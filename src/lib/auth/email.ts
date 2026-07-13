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

/** True when SMTP is fully configured (host + auth + sender). */
const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.EMAIL_FROM,
);

async function sendViaSmtp(msg: AuthEmail): Promise<void> {
  // Dynamic import so the mailer is only loaded when SMTP is actually used.
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== "false", // true for 465, false for 587
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
  });
}

async function deliver(msg: AuthEmail): Promise<void> {
  // Real transport (SMTP) when configured — works in dev AND production.
  if (smtpConfigured) {
    await sendViaSmtp(msg);
    return;
  }

  // No transport configured: fall back to the log.
  // msg.text/subject carry the reset token and OTP code, so never log them in
  // production (they'd become live account-takeover secrets in any log sink).
  // Prod logs metadata only; the full body is logged in dev so the flows stay
  // demoable without a mail server (mirrors revealSecretsInUi).
  if (isProd) {
    console.info(`[auth-email] to=${msg.to} — delivery skipped (no transport); body suppressed`);
    return;
  }
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
