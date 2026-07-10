"use server";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { recordAudit, asAuditAction } from "@/lib/audit";

// SCRUM-100 — record that an admin opened the audit console (the console is
// itself an auditable access to sensitive records). Best-effort, gated on
// `alerts:read`; fired once from a client mount effect to avoid a side-effect in
// server render. `filter` is the active action filter, if any (a code, no PII).
export async function logAuditConsoleViewAction(filter: string | null): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "alerts:read")) return;
  await recordAudit(
    { userId: user.id, role: user.role },
    {
      action: "AUDIT_CONSOLE_VIEWED",
      meta: { filter: asAuditAction(filter) ?? "ALL" },
    },
  );
}
