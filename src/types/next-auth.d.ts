import type { Role } from "@/lib/rbac";

// Augment Auth.js types with our custom session fields.
declare module "next-auth" {
  interface User {
    role: Role;
    employeeId: string | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
      employeeId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    employeeId: string | null;
  }
}
