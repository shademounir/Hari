// `export {}` keeps this file a MODULE. Without a top-level import/export it is
// a global script, and `declare module "next-auth"` then REPLACES Auth.js's
// types instead of augmenting them (NextAuthConfig and friends vanish).
export {};

// Augment Auth.js types with our custom session fields.
//
// Note what is NOT here: `role` and `employeeId`. They used to ride on the JWT
// and project onto the session, which meant an admin changing someone's role had
// no effect until that token expired (up to 30 days). Authorization now resolves
// per request from the database — `requireUser()` / `getApiCaller()` in
// `lib/session.ts` are the only source of a caller's role and permissions.
//
// Keeping them off the session type is deliberate: a stale `session.user.role`
// is a security footgun, and this makes reading one a compile error rather than
// a silent privilege leak.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}
