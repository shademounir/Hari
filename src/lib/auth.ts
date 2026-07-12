import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/rbac";
import { normalizeEmail, verifyAuthToken } from "@/lib/auth/tokens";
import type { AuthTokenType } from "@prisma/client";

// Google is optional: the provider (and its button) only appear when both
// credentials are configured, so the default build needs no OAuth secrets.
export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/** Load a user by email with the fields the session needs. */
async function loadUser(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    include: { employee: { select: { id: true } } },
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
    authorize: async (credentials) => {
      const email = normalizeEmail(String(credentials?.email ?? ""));
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      const user = await loadUser(email);
      // Passwordless-only accounts have no hash → credentials login can't apply.
      if (!user?.passwordHash) return null;

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        employeeId: user.employee?.id ?? null,
      };
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
      if (!user) return null; // only pre-provisioned accounts may sign in

      // First successful passwordless confirm proves the address.
      if (!user.emailVerified) {
        await prisma.user
          .update({ where: { id: user.id }, data: { emailVerified: new Date() } })
          .catch(() => {});
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        employeeId: user.employee?.id ?? null,
      };
    },
  }),
];

if (googleEnabled) {
  // Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET automatically.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

// Auth.js v5 (JWT sessions — required for the Credentials providers). The session
// carries id + role + employeeId so RBAC checks and AI tools can scope data with
// no per-request DB round-trip.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  callbacks: {
    // Google: only pre-provisioned employees may sign in. An unknown Google
    // account is rejected here (HR creates accounts; sign-in never creates one).
    async signIn({ account, user }) {
      if (account?.provider === "google") {
        const email = normalizeEmail(user?.email ?? "");
        if (!email) return false;
        const known = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        return Boolean(known);
      }
      return true;
    },
    // Capture role/employeeId on the token at sign-in. Credentials/passwordless
    // authorize already return them; for Google we resolve OUR user by email and
    // rebind the subject to our user id (id on `token.sub`).
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const dbUser = await loadUser(user.email ?? "");
          if (dbUser) {
            token.sub = dbUser.id;
            token.name = dbUser.name;
            token.role = dbUser.role;
            token.employeeId = dbUser.employee?.id ?? null;
          }
        } else {
          token.role = user.role;
          token.employeeId = user.employeeId;
        }
      }
      return token;
    },
    // Pure projection of the token onto the session — no DB.
    session({ session, token }) {
      if (!session.user) return session;
      session.user.id = token.sub as string;
      session.user.role = token.role as Role;
      session.user.employeeId = (token.employeeId as string | null) ?? null;
      return session;
    },
  },
});
