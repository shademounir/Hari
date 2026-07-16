// ─────────────────────────────────────────────────────────────────────────
// SCRUM-096: offboarding — the compliant exit workflow.
//
// When an employee leaves, HR initiates offboarding: a standard checklist of
// exit steps (revoke access, recover equipment, final pay, handover, exit
// interview). When every step is done, HR completes the process, which ARCHIVES
// the employee (status → TERMINATED) instead of deleting them, so their records
// are retained for conformité. Every significant action — initiation, each step
// completed, and the final archive — is written to the AuditLog (SCRUM-064),
// metadata only (ids / codes / counts, never names, content, or salary).
//
// Entirely HR-facing: every function is gated on `employee:manage` server-side.
// ─────────────────────────────────────────────────────────────────────────
import type {
  OffboardingCategory,
  OffboardingReason,
  OffboardingState,
  OffboardingTaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

/**
 * The standard exit checklist. `as const` so step keys stay literal for typed
 * i18n (labels live under `offboarding.steps.<key>`); array order is display
 * order (persisted as `order`).
 */
export const OFFBOARDING_TEMPLATE = [
  { key: "revokeAccounts", category: "ACCESS" },
  { key: "disableEmail", category: "ACCESS" },
  { key: "collectBadge", category: "EQUIPMENT" },
  { key: "returnLaptop", category: "EQUIPMENT" },
  { key: "returnDevices", category: "EQUIPMENT" },
  { key: "finalPay", category: "PAYROLL" },
  { key: "benefitsTermination", category: "PAYROLL" },
  { key: "knowledgeHandover", category: "KNOWLEDGE" },
  { key: "documentation", category: "KNOWLEDGE" },
  { key: "exitInterview", category: "EXIT" },
  { key: "offboardingLetter", category: "EXIT" },
] as const satisfies readonly { key: string; category: OffboardingCategory }[];

export type OffboardingStepKey = (typeof OFFBOARDING_TEMPLATE)[number]["key"];

const STEP_KEYS = OFFBOARDING_TEMPLATE.map((s) => s.key) as readonly OffboardingStepKey[];
export function asOffboardingStepKey(v: string): OffboardingStepKey {
  return (STEP_KEYS as readonly string[]).includes(v) ? (v as OffboardingStepKey) : STEP_KEYS[0];
}

const CATEGORY_KEYS = ["ACCESS", "EQUIPMENT", "PAYROLL", "KNOWLEDGE", "EXIT"] as const;
export function asOffboardingCategory(v: string): (typeof CATEGORY_KEYS)[number] {
  return (CATEGORY_KEYS as readonly string[]).includes(v)
    ? (v as (typeof CATEGORY_KEYS)[number])
    : "ACCESS";
}

const REASONS = [
  "RESIGNATION",
  "TERMINATION",
  "END_OF_CONTRACT",
  "RETIREMENT",
  "OTHER",
] as const;
export function asOffboardingReason(v: string): OffboardingReason {
  return (REASONS as readonly string[]).includes(v) ? (v as OffboardingReason) : "OTHER";
}

export type OffboardingProgress = { total: number; done: number; percent: number };

export function computeProgress(tasks: { status: OffboardingTaskStatus }[]): OffboardingProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

export type OffboardingCandidate = {
  employeeId: string;
  name: string;
  title: string;
  department: string;
};

export type OffboardingStepView = {
  id: string;
  key: string;
  category: OffboardingCategory;
  status: OffboardingTaskStatus;
};

export type OffboardingView = {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  reason: OffboardingReason;
  state: OffboardingState;
  lastDay: Date;
  completedAt: Date | null;
  steps: OffboardingStepView[];
  progress: OffboardingProgress;
};

/** Active employees who don't yet have an offboarding — candidates to start one. */
export async function listOffboardingCandidates(
  actor: Actor,
): Promise<OffboardingCandidate[]> {
  if (!can(actor, "employee:manage")) return [];
  const employees = await prisma.employee.findMany({
    where: { status: { not: "TERMINATED" }, offboarding: null },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      title: true,
      department: true,
      user: { select: { name: true } },
    },
  });
  return employees.map((e) => ({
    employeeId: e.id,
    name: e.user?.name ?? "—",
    title: e.title,
    department: e.department,
  }));
}

function toView(o: {
  id: string;
  employeeId: string;
  reason: OffboardingReason;
  state: OffboardingState;
  lastDay: Date;
  completedAt: Date | null;
  employee: { title: string; user: { name: string } | null };
  tasks: { id: string; key: string; category: OffboardingCategory; status: OffboardingTaskStatus }[];
}): OffboardingView {
  return {
    id: o.id,
    employeeId: o.employeeId,
    employeeName: o.employee.user?.name ?? "—",
    title: o.employee.title,
    reason: o.reason,
    state: o.state,
    lastDay: o.lastDay,
    completedAt: o.completedAt,
    steps: o.tasks.map((t) => ({
      id: t.id,
      key: t.key,
      category: t.category,
      status: t.status,
    })),
    progress: computeProgress(o.tasks),
  };
}

/** All offboardings (optionally by state), newest first. Gated on employee:manage. */
export async function getOffboardings(
  actor: Actor,
  state?: OffboardingState,
): Promise<OffboardingView[]> {
  if (!can(actor, "employee:manage")) return [];
  const rows = await prisma.offboarding.findMany({
    where: state ? { state } : {},
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { title: true, user: { select: { name: true } } } },
      tasks: { orderBy: { order: "asc" } },
    },
  });
  return rows.map(toView);
}

export type InitiateResult = "ok" | "forbidden" | "not_found" | "exists";

/**
 * Start offboarding for an employee: create the process, seed the exit checklist
 * from the template, and record OFFBOARDING_INITIATED. Idempotent guard: an
 * employee can only have one offboarding (`employeeId @unique`).
 */
export async function initiateOffboarding(
  actor: Actor,
  input: { employeeId: string; reason: OffboardingReason; lastDay: Date },
): Promise<InitiateResult> {
  if (!can(actor, "employee:manage")) return "forbidden";

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, offboarding: { select: { id: true } } },
  });
  if (!employee) return "not_found";
  if (employee.offboarding) return "exists";

  await prisma.offboarding.create({
    data: {
      employeeId: input.employeeId,
      reason: input.reason,
      lastDay: input.lastDay,
      initiatedById: actor.userId,
      tasks: {
        create: OFFBOARDING_TEMPLATE.map((step, i) => ({
          key: step.key,
          category: step.category,
          order: i,
        })),
      },
    },
  });

  await recordAudit(actor, {
    action: "OFFBOARDING_INITIATED",
    targetType: "Employee",
    targetId: input.employeeId,
    meta: { reason: input.reason },
  });
  return "ok";
}

/**
 * Toggle one exit step. On completion, records OFFBOARDING_STEP_COMPLETED with
 * the step key/category (no PII). A step can only be changed while its
 * offboarding is still IN_PROGRESS. Returns true on success.
 */
export async function setOffboardingStepStatus(
  actor: Actor,
  taskId: string,
  done: boolean,
): Promise<boolean> {
  if (!can(actor, "employee:manage")) return false;

  const task = await prisma.offboardingTask.findUnique({
    where: { id: taskId },
    select: {
      key: true,
      category: true,
      offboarding: { select: { id: true, state: true, employeeId: true } },
    },
  });
  if (!task || task.offboarding.state !== "IN_PROGRESS") return false;

  await prisma.offboardingTask.update({
    where: { id: taskId },
    data: {
      status: done ? "DONE" : "PENDING",
      completedAt: done ? new Date() : null,
    },
  });

  if (done) {
    await recordAudit(actor, {
      action: "OFFBOARDING_STEP_COMPLETED",
      targetType: "Employee",
      targetId: task.offboarding.employeeId,
      meta: { step: task.key, category: task.category },
    });
  }
  return true;
}

export type CompleteResult = "ok" | "forbidden" | "not_found" | "incomplete" | "already_done";

/**
 * Complete offboarding: requires every step DONE, then archives the employee
 * (status → TERMINATED — never a delete) and records EMPLOYEE_OFFBOARDED. Done
 * atomically so the archive and the state change can't diverge.
 */
export async function completeOffboarding(
  actor: Actor,
  offboardingId: string,
): Promise<CompleteResult> {
  if (!can(actor, "employee:manage")) return "forbidden";

  const off = await prisma.offboarding.findUnique({
    where: { id: offboardingId },
    include: { tasks: { select: { status: true } } },
  });
  if (!off) return "not_found";
  if (off.state === "COMPLETED") return "already_done";
  if (off.tasks.some((t) => t.status !== "DONE")) return "incomplete";

  await prisma.$transaction([
    prisma.offboarding.update({
      where: { id: offboardingId },
      data: { state: "COMPLETED", completedAt: new Date() },
    }),
    prisma.employee.update({
      where: { id: off.employeeId },
      data: { status: "TERMINATED" },
    }),
  ]);

  await recordAudit(actor, {
    action: "EMPLOYEE_OFFBOARDED",
    targetType: "Employee",
    targetId: off.employeeId,
    meta: { reason: off.reason, steps: off.tasks.length },
  });
  return "ok";
}
