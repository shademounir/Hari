import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/rbac";

// Resolve the caller's live identity from the DB by the stable, unique email —
// NOT the JWT-cached id/role/employeeId, which are a login-time snapshot that
// goes stale when the DB diverges from the token (a `db:reset` re-mints user
// ids; a role change or employee re-link takes effect only at next login).
// Resolving in the `session` callback makes `session.user` fresh at every entry
// point (server components via requireUser + route handlers via auth()) with no
// per-call-site lookups. `cache()` dedupes it to one indexed query per request,
// matching the pattern in lib/settings.ts and lib/nav-items.ts.
const resolveIdentity = cache((email: string) =>
  prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, employee: { select: { id: true } } },
  }),
);

// Auth.js v5 (JWT sessions — required for the Credentials provider).
// The session carries `id` + `role` + `employeeId` (resolved live below) so
// RBAC checks and AI tools can scope data to the signed-in user.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { employee: { select: { id: true } } },
        });
        if (!user) return null;

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
  ],
  callbacks: {
    // Persist role/employeeId on the token as a last-known fallback for the
    // `session` callback below (used only when the DB can't resolve the email).
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeId = user.employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      // Live identity from the DB keyed on the stable, unique email — so id,
      // role, and employeeId reflect the current DB, not the login-time token.
      const email = token.email ?? session.user.email;
      const dbUser = email ? await resolveIdentity(email) : null;

      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.role = dbUser.role as Role;
        session.user.employeeId = dbUser.employee?.id ?? null;
      } else {
        // Email unresolvable (deleted account / missing email): fall back to the
        // token snapshot — same behavior as before this change, no regression.
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.employeeId = (token.employeeId as string | null) ?? null;
      }
      return session;
    },
  },
});
