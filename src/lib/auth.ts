import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, verifyAuthToken } from "@/lib/auth/tokens";
import { rateLimit, rateLimitPeek, clientIp } from "@/lib/rate-limit";
import type { AuthTokenType } from "@prisma/client";

// Brute-force brake on password login. Only FAILED attempts accrue, so a
// legitimate sign-in (including the demo one-click logins) never trips it.
// Two keys: a tight per-(ip,email) cap, AND a looser per-EMAIL cap that is
// IP-INDEPENDENT — so an attacker rotating X-Forwarded-For (which lands in a fresh
// ip:email bucket each time) is still throttled globally against one account.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_MAX_FAILURES_EMAIL = 20;
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Google is optional: the provider (and its button) only appear when both
// credentials are configured, so the default build needs no OAuth secrets.
export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/** Load a user by email with the fields sign-in needs. */
async function loadUser(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      active: true,
      emailVerified: true,
    },
  });
}

const providers: NextAuthConfig["providers"] = [
  // 1) Email + password.
  Credentials({
    id: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (credentials, request) => {
      const email = normalizeEmail(String(credentials?.email ?? ""));
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      // Reject early (before bcrypt) once EITHER the per-(ip,email) OR the
      // IP-independent per-email cap is exceeded — throttles online brute-forcing
      // (including XFF-rotation) without a DB round-trip on the password itself.
      const ipKey = `${clientIp((request as Request | undefined)?.headers)}:${email}`;
      const recordFailure = () =>
        Promise.all([
          rateLimit("login", ipKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS),
          rateLimit("login-email", email, LOGIN_MAX_FAILURES_EMAIL, LOGIN_WINDOW_MS),
        ]);
      const [ipPeek, emailPeek] = await Promise.all([
        rateLimitPeek("login", ipKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS),
        rateLimitPeek("login-email", email, LOGIN_MAX_FAILURES_EMAIL, LOGIN_WINDOW_MS),
      ]);
      if (!ipPeek.ok || !emailPeek.ok) return null;

      const user = await loadUser(email);
      // Passwordless-only accounts have no hash → credentials login can't apply.
      // A deactivated account is refused here, indistinguishably from a bad
      // password (no enumeration signal) and before bcrypt runs.
      if (!user?.passwordHash || !user.active) {
        await recordFailure();
        return null;
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        await recordFailure();
        return null;
      }

      return { id: user.id, name: user.name, email: user.email };
    },
  }),

  // 2) Passwordless: magic link OR email OTP. The one-time secret is verified
  //    (and consumed) here; `kind` selects which token type. Both share one
  //    provider so the session/JWT plumbing stays identical.
  Credentials({
    id: "passwordless",
    name: "Passwordless",
    credentials: { email: {}, secret: {}, kind: {} },
    authorize: async (credentials) => {
      const email = normalizeEmail(String(credentials?.email ?? ""));
      const secret = String(credentials?.secret ?? "");
      const kind = String(credentials?.kind ?? "");
      if (kind !== "MAGIC_LINK" && kind !== "EMAIL_OTP") return null;

      const res = await verifyAuthToken(kind as AuthTokenType, email, secret);
      if (!res.ok) return null;

      const user = await loadUser(email);
      // Only pre-provisioned, active accounts may sign in. Consuming a valid
      // token is not enough: deactivating an account must close this door too.
      if (!user?.active) return null;

      // First successful passwordless confirm proves the address.
      if (!user.emailVerified) {
        await prisma.user
          .update({ where: { id: user.id }, data: { emailVerified: new Date() } })
          .catch(() => {});
      }

      return { id: user.id, name: user.name, email: user.email };
    },
  }),
];

if (googleEnabled) {
  // Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET automatically.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

// Auth.js v5 (JWT sessions — required for the Credentials providers).
//
// The token carries IDENTITY ONLY (`sub`). Role and permissions are resolved per
// request from the database in `lib/session.ts`, because a role claim on a
// 30-day token cannot be revoked: `updateAge` re-signs the token without
// re-running `authorize`, so a stale role would just be copied forward. Trading
// one indexed read per request (deduped by React `cache()`) for a demotion that
// actually takes effect is the right side of that bargain.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  callbacks: {
    // Google: only pre-provisioned, ACTIVE employees may sign in. An unknown or
    // deactivated Google account is rejected here (HR creates accounts; sign-in
    // never creates one).
    async signIn({ account, user }) {
      if (account?.provider === "google") {
        const email = normalizeEmail(user?.email ?? "");
        if (!email) return false;
        const known = await prisma.user.findUnique({
          where: { email },
          select: { active: true },
        });
        return Boolean(known?.active);
      }
      return true;
    },
    // Google authenticates by email, so rebind the subject to OUR user id — every
    // downstream lookup keys off `token.sub`. Nothing else is captured: role and
    // employeeId are resolved per request from the database, not carried here.
    async jwt({ token, user, account }) {
      if (user && account?.provider === "google") {
        const dbUser = await loadUser(user.email ?? "");
        if (dbUser) {
          token.sub = dbUser.id;
          token.name = dbUser.name;
        }
      }
      return token;
    },
    // Identity only. `lib/session.ts` resolves role + permissions from the DB.
    session({ session, token }) {
      if (session.user) session.user.id = token.sub as string;
      return session;
    },
  },
});
