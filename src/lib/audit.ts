// ─────────────────────────────────────────────────────────────────────────
// SCRUM-064: a minimal audit trail of SENSITIVE admin/security actions, so an
// Admin/HR can verify after the fact that no confidential data was mishandled.
//
// The sensitive actions worth recording here are the admin ones that AiEvent
// (SCRUM-062) does NOT already cover: alert triage (acknowledge / resolve /
// reopen) and access to the alerts console. AI interactions themselves — turns,
// tool calls, refusals, guard blocks — are already traced by `recordAiEvent`.
//
// The no-PII contract is the same as AiEvent/Alert: store only ids, the actor's
// role, the action, and small structured `meta` (codes/counts) — NEVER names,
// message content, or salary. `recordAudit` is best-effort and never throws into
// its caller, so a failed audit write can't break the action it was recording.
// Reads are permission-checked server-side (`alerts:read` → Admin/HR).
// ─────────────────────────────────────────────────────────────────────────
import { AuditAction } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Role, type Subject } from "@/lib/rbac";

/** All audit actions, for the console's filter UI. Runtime enum values. */
export const AUDIT_ACTIONS = Object.values(AuditAction) as AuditAction[];

/** Narrow an untrusted string (e.g. a search param) to a known AuditAction. */
export function asAuditAction(v: string | null | undefined): AuditAction | undefined {
  return v && (AUDIT_ACTIONS as string[]).includes(v) ? (v as AuditAction) : undefined;
}

/**
 * The signed-in user performing the action being recorded. `role` is written to
 * the trail as a SNAPSHOT of the slug — no permission check happens on write, so
 * this deliberately does not need a resolved permission set.
 */
export type AuditActor = { userId: string; role: Role };

export type RecordAuditInput = {
  action: AuditAction;
  /** The kind of thing acted on, e.g. "Alert". Never content. */
  targetType?: string | null;
  /** The opaque id of the target (e.g. an alert id). Never content. */
  targetId?: string | null;
  /** Soft references to the related Alert / AiEvent, by id. */
  alertId?: string | null;
  aiEventId?: string | null;
  /** Small structured extras (codes/counts) — NO PII. */
  meta?: Prisma.InputJsonValue | null;
};

/**
 * Record a sensitive action. Best-effort: it swallows and logs any error and
 * returns the new id (or null), so callers can fire-and-forget without risk of
 * an audit failure breaking the action itself.
 */
export async function recordAudit(
  actor: AuditActor,
  input: RecordAuditInput,
): Promise<string | null> {
  try {
    const row = await prisma.auditLog.create({
      data: {
        actorId: actor.userId,
        actorRole: actor.role,
        action: input.action,
        targetType: input.targetType ?? undefined,
        targetId: input.targetId ?? undefined,
        alertId: input.alertId ?? undefined,
        aiEventId: input.aiEventId ?? undefined,
        meta: input.meta ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[audit] record failed:", err);
    return null;
  }
}

export type AuditEntry = {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorRole: Role;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  alertId: string | null;
  aiEventId: string | null;
  meta: Record<string, unknown> | null;
};

const toEntry = (
  r: Prisma.AuditLogGetPayload<Record<string, never>>,
): AuditEntry => ({
  id: r.id,
  createdAt: r.createdAt,
  actorId: r.actorId,
  actorRole: r.actorRole,
  action: r.action,
  targetType: r.targetType,
  targetId: r.targetId,
  alertId: r.alertId,
  aiEventId: r.aiEventId,
  meta:
    r.meta && typeof r.meta === "object" && !Array.isArray(r.meta)
      ? (r.meta as Record<string, unknown>)
      : null,
});

/**
 * Read the audit trail, newest first. Gated on `alerts:read` (Admin / HR), so a
 * non-privileged caller gets an empty list — never a leak. Optionally filter by
 * action or the acting user.
 */
export async function getAuditLog(
  actor: Subject,
  filter?: { action?: AuditAction; actorId?: string },
  limit = 100,
): Promise<AuditEntry[]> {
  if (!can(actor, "alerts:read")) return [];
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filter?.action ? { action: filter.action } : {}),
      ...(filter?.actorId ? { actorId: filter.actorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toEntry);
}
