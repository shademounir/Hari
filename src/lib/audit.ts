// ─────────────────────────────────────────────────────────────────────────
// Sensitive-action audit trail (SCRUM-064). The single write path for
// AuditLog — a metadata-only record of the three sensitive actions in scope
// for Sprint 3: a controlled AI refusal, an alert's status changing, and an
// Admin opening the alerts console.
//
// Same no-PII contract as AiEvent (SCRUM-062) / Alert (SCRUM-063): never pass
// prompt/response text, employee names, or salary here — only actor, action,
// target ids, and small structured codes, so the audit trail itself can never
// become a new source of leakage.
//
// Recording is best-effort, same as recordAiEvent/createAlert: it must never
// throw into the caller's request/response path, so every write is wrapped
// and failures are logged, not propagated.
// ─────────────────────────────────────────────────────────────────────────
import type { AuditAction, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export type RecordAuditLogInput = {
  action: AuditAction;
  actorId?: string | null;
  actorRole: Role;
  targetType?: string | null;
  targetId?: string | null;
  aiEventId?: string | null;
  meta?: Prisma.InputJsonValue | null;
};

/**
 * Persist one audit trail entry. Returns the created row's id or null if the
 * write failed — callers must tolerate null and never let this block the
 * response (chat stream, server action, page render).
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<string | null> {
  try {
    const { meta, ...rest } = input;
    const row = await prisma.auditLog.create({
      data: {
        ...rest,
        meta: meta ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[auditLog] record failed:", err);
    return null;
  }
}

export type AuditLogView = {
  id: string;
  createdAt: Date;
  action: AuditAction;
  actorRole: Role;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
};

const toMeta = (v: Prisma.JsonValue | null): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Read the audit trail. Gated by `audit:read` (RSSI / Super Admin only) — this
 * is a stricter perimeter than `alerts:read`, since the audit trail is what
 * proves after the fact that no confidential data leaked, so it's kept out of
 * reach of the day-to-day HR_ADMIN role. Returns [] for any other role, with
 * no DB access, same defensive pattern as getOpenAlerts/getAlerts.
 */
export async function getAuditLogs(
  actor: { role: Role },
  filter?: { action?: AuditAction },
  limit = 100,
): Promise<AuditLogView[]> {
  if (!can(actor.role, "audit:read")) return [];
  const rows = await prisma.auditLog.findMany({
    where: filter?.action ? { action: filter.action } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorRole: true,
      actor: { select: { name: true } },
      targetType: true,
      targetId: true,
      meta: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    actorRole: r.actorRole,
    actorName: r.actor?.name ?? null,
    targetType: r.targetType,
    targetId: r.targetId,
    meta: toMeta(r.meta),
  }));
}
