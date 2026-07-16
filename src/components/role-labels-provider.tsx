"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/rbac";

// Slug → display label for every role, made available to client components.
//
// Client code cannot call `t(slug)` for a role any more: roles are data, so a
// custom slug has no `roles.*` message key (and wouldn't typecheck against one).
// The dashboard layout resolves the labels on the server — translating the
// built-ins, passing custom labels through as the user data they are — and feeds
// this provider, exactly like OrgSettingsProvider does for currency/timezone.
const RoleLabelsContext = createContext<Record<Role, string> | null>(null);

export function RoleLabelsProvider({
  value,
  children,
}: {
  value: Record<Role, string>;
  children: React.ReactNode;
}) {
  return <RoleLabelsContext.Provider value={value}>{children}</RoleLabelsContext.Provider>;
}

/**
 * Look up a role's label. Falls back to the raw slug for a role that no longer
 * exists (a deleted custom role still named by a historical record), which is
 * why AiEvent.role / AuditLog.actorRole carry no foreign key.
 */
export function useRoleLabel(): (role: Role) => string {
  const labels = useContext(RoleLabelsContext);
  if (!labels) {
    throw new Error("useRoleLabel must be used within a RoleLabelsProvider");
  }
  return (role: Role) => labels[role] ?? role;
}
