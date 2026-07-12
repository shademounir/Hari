# Authentication

HARI uses **Auth.js v5** with **JWT sessions**. The session carries `id`, `role`
and `employeeId`, so RBAC checks and AI tools scope data to the signed-in user
with no per-request DB round-trip (see `src/lib/auth.ts`).

There are **five** ways to sign in. All of them resolve to the same JWT session
and the same pre-provisioned `User`/`Employee` records — **sign-in never creates
an account**; HR provisions users, and every method only authenticates an
existing one.

| Method | Provider id | Secret | Where it's verified |
|---|---|---|---|
| Email + password | `credentials` | bcrypt hash on `User.passwordHash` | `authorize` |
| Passwordless **magic link** | `passwordless` (`kind=MAGIC_LINK`) | one-time link token | `verifyAuthToken` |
| Passwordless **email OTP** | `passwordless` (`kind=EMAIL_OTP`) | 6-digit code | `verifyAuthToken` |
| **Google** OAuth | `google` (env-gated) | Google account (email must be known) | `signIn` callback |
| **Password reset** (then password) | — | one-time reset token | `verifyAuthToken` → new hash |

## One-time secrets (`src/lib/auth/tokens.ts`)

Password reset, magic link, and email OTP are all backed by a single `AuthToken`
table. Security invariants (unit-tested in `tests/auth-tokens.test.ts`):

- **Hash-only storage** — only `SHA-256(secret)` is persisted; a DB leak can't be
  replayed.
- **Single-use** — a token is consumed (`consumedAt`) on first successful verify.
- **Short-lived** — per-type TTL: reset 30 min, magic link 15 min, OTP 10 min.
- **Rotation** — issuing a new token of a kind invalidates the previous live one.
- **OTP throttling** — after 5 wrong codes the token locks out (`too_many`).
- **Constant-time** hash comparison.
- **Anti-enumeration** — the request forms always report "email sent" whether or
  not the account exists; a secret is only created/sent for a real user.

## Email delivery (`src/lib/auth/email.ts`)

This starter ships **without** a bundled mail transport, so the default build
stays dependency-free and CI reproducible. Auth emails are written to the server
log, so all flows work end-to-end in dev and on any host whose logs you can read.

In **development** the link/code is also surfaced directly in the UI (guarded by
`revealSecretsInUi`; disable with `AUTH_REVEAL_DEV_SECRETS=false`), so you can
demo the flows without a mail server.

To send real email in production, implement `deliver()` in `email.ts` behind your
provider's env vars (SMTP / Resend / SES) — nothing else changes.

## Google OAuth

Google is **optional**. The provider and its "Continue with Google" button only
appear when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set
(`googleEnabled` in `src/lib/auth.ts`). On sign-in, the `signIn` callback rejects
any Google account whose email isn't a known `User` — consistent with the
HR-provisioned model. The `jwt` callback then rebinds the session subject to our
`User.id` and loads `role`/`employeeId`.

Authorized redirect URI: `<AUTH_URL>/api/auth/callback/google`.

## Routes & UI

- `/login` — demo roles, email+password, "Forgot your password?", and the
  **Google / magic link / email code** alternatives (`alt-auth.tsx`).
- `/forgot-password` → emails a reset link.
- `/reset-password?email=&token=` → sets a new password, then `/login?reset=1`.
- `/login/magic?email=&token=` → completes a magic-link sign-in.

`User.passwordHash` is nullable so passwordless-only accounts can exist; the first
successful OTP/magic confirm stamps `User.emailVerified`.

## Environment

```
AUTH_SECRET=...            # required
AUTH_URL=...               # base URL for email links (optional in dev)
AUTH_GOOGLE_ID=...         # optional — enables Google
AUTH_GOOGLE_SECRET=...     # optional — enables Google
AUTH_REVEAL_DEV_SECRETS=true   # dev only: show link/code on screen
```
