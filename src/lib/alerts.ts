// ─────────────────────────────────────────────────────────────────────────
// Actionable AI alerts for Admin/HR (SCRUM-063). Gated by `alerts:read`, so
// only HR_ADMIN / SUPER_ADMIN can list or triage them. Alerts store an i18n
// key + small params (never localized/sensitive text), consistent with the
// AiEvent no-PII contract and the app's mandatory-i18n rule.
//
// createAlert is best-effort (like recordAiEvent): it must never throw into the
// chat stream. The read/triage paths are permission-checked server-side.
// ─────────────────────────────────────────────────────────────────────────
import type { AlertKind, AlertSeverity, AlertStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Actor, type Subject } from "@/lib/rbac";

/** The signed-in user acting on alerts. Reads need only the role; triage stamps the userId. */
/** Who acknowledged / resolved an alert. */
export type AlertActor = Actor;

export type AlertView = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  titleKey: string;
  params: Record<string, unknown> | null;
  href: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  subjectName: string | null; // who triggered it (null if system / deleted)
  acknowledgedByName: string | null;
  resolvedByName: string | null;
};

export type CreateAlertInput = {
  kind: AlertKind;
  titleKey: string;
  severity?: AlertSeverity;
  params?: Prisma.InputJsonValue | null;
  href?: string | null;
  subjectId?: string | null;
  aiEventId?: string | null;
  // If set (and subjectId present), coalesce: skip creating a new row when a
  // non-resolved alert of the same kind+subject already exists within this window,
  // returning the existing id. Keeps one probing user from flooding the bell and
  // makes threshold escalations (AI_REFUSAL) idempotent under concurrent turns.
  dedupeWithinMs?: number;
};

const toParams = (v: Prisma.JsonValue | null): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * The single most relevant param for an alert, as a display string (a code /
 * count — never PII), shown next to the localized kind title. Null if none.
 */
export function alertDetail(a: Pick<AlertView, "kind" | "params">): string | null {
  const p = a.params ?? {};
  const pick = (k: string) => (p[k] == null ? null : String(p[k]));
  switch (a.kind) {
    case "AI_GUARD_BLOCK":
      return pick("rule");
    case "AI_REFUSAL":
      return pick("count");
    case "AI_ERROR":
      return pick("code");
    case "CONVERSATION_CLOSED":
      return pick("reason");
    case "DEPARTURE_RISK":
      return pick("score");
    default:
      return null;
  }
}

/**
 * Raise an actionable alert. Best-effort: swallows + logs errors and returns the
 * new id (or null) so the chat pipeline can fire-and-forget without risk.
 */
export async function createAlert(input: CreateAlertInput): Promise<string | null> {
  try {
    const { params, dedupeWithinMs, ...rest } = input;
    if (dedupeWithinMs && rest.subjectId) {
      const existing = await prisma.alert.findFirst({
        where: {
          kind: rest.kind,
          subjectId: rest.subjectId,
          status: { not: "RESOLVED" },
          createdAt: { gte: new Date(Date.now() - dedupeWithinMs) },
        },
        select: { id: true },
      });
      if (existing) return existing.id; // fold into the existing open alert
    }
    const row = await prisma.alert.create({
      data: { ...rest, params: params ?? undefined },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[alert] create failed:", err);
    return null;
  }
}

const SELECT = {
  id: true,
  kind: true,
  severity: true,
  status: true,
  titleKey: true,
  params: true,
  href: true,
  createdAt: true,
  resolvedAt: true,
  subject: { select: { name: true } },
  acknowledgedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
} satisfies Prisma.AlertSelect;

type AlertRow = Prisma.AlertGetPayload<{ select: typeof SELECT }>;

const toView = (a: AlertRow): AlertView => ({
  id: a.id,
  kind: a.kind,
  severity: a.severity,
  status: a.status,
  titleKey: a.titleKey,
  params: toParams(a.params),
  href: a.href,
  createdAt: a.createdAt,
  resolvedAt: a.resolvedAt,
  subjectName: a.subject?.name ?? null,
  acknowledgedByName: a.acknowledgedBy?.name ?? null,
  resolvedByName: a.resolvedBy?.name ?? null,
});

/** Open (un-resolved) alerts for the bell. Empty unless the caller may read alerts. */
export async function getOpenAlerts(actor: Subject, limit = 20): Promise<AlertView[]> {
  if (!can(actor, "alerts:read")) return [];
  const rows = await prisma.alert.findMany({
    where: { status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: SELECT,
  });
  return rows.map(toView);
}

export type AlertStatusCounts = { OPEN: number; ACKNOWLEDGED: number; RESOLVED: number; all: number };

/** Per-status totals for the /alerts filter tabs. Zeroed unless the caller may read alerts. */
export async function getAlertStatusCounts(actor: Subject): Promise<AlertStatusCounts> {
  const counts: AlertStatusCounts = { OPEN: 0, ACKNOWLEDGED: 0, RESOLVED: 0, all: 0 };
  if (!can(actor, "alerts:read")) return counts;
  const grouped = await prisma.alert.groupBy({ by: ["status"], _count: { _all: true } });
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.all += g._count._all;
  }
  return counts;
}

/** Full alert list for the /alerts page, optionally filtered by status. */
export async function getAlerts(
  actor: Subject,
  filter?: { status?: AlertStatus },
  limit = 100,
): Promise<AlertView[]> {
  if (!can(actor, "alerts:read")) return [];
  const rows = await prisma.alert.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: SELECT,
  });
  return rows.map(toView);
}

/** Move an OPEN alert to ACKNOWLEDGED, stamping who did it. No-op if not permitted. */
export async function acknowledgeAlert(actor: AlertActor, id: string): Promise<boolean> {
  if (!can(actor, "alerts:read")) return false;
  const res = await prisma.alert.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "ACKNOWLEDGED", ackById: actor.userId },
  });
  return res.count > 0;
}

/**
 * Resolve an alert (from any non-resolved state), stamping the resolver + time.
 * Uses `resolvedById` (not `ackById`) so the acknowledger and the resolver stay
 * distinct in the audit.
 */
export async function resolveAlert(actor: AlertActor, id: string): Promise<boolean> {
  if (!can(actor, "alerts:read")) return false;
  const res = await prisma.alert.updateMany({
    where: { id, status: { not: "RESOLVED" } },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actor.userId },
  });
  return res.count > 0;
}

/**
 * Reopen a resolved alert, returning it to a pristine OPEN (clears the resolver
 * timestamp and any acknowledger) so it re-enters triage and the bell. For the
 * "closed by mistake" case. No-op unless the caller may read alerts.
 */
export async function reopenAlert(actor: AlertActor, id: string): Promise<boolean> {
  if (!can(actor, "alerts:read")) return false;
  const res = await prisma.alert.updateMany({
    where: { id, status: "RESOLVED" },
    data: { status: "OPEN", resolvedAt: null, resolvedById: null, ackById: null },
  });
  return res.count > 0;
}
