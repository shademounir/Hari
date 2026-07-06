// ─────────────────────────────────────────────────────────────────────────
// SCRUM-095: personalized onboarding checklist for new hires.
//
// A new employee gets a standard set of onboarding steps (paperwork, equipment,
// access, training, orientation). Each step is a stable i18n `key` — never free
// text — so the checklist is fully localized (EN/FR), consistent with the
// mandatory-i18n rule. Every employee sees + ticks off their OWN checklist; HR
// (`directory:read:all`) gets a read-only progress overview across the company.
//
// Role scope, like the rest of the app, is enforced server-side here — the page
// only renders what these functions return for the caller's role.
// ─────────────────────────────────────────────────────────────────────────
import type { OnboardingCategory, OnboardingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Caller } from "@/lib/hr";

/**
 * The standard onboarding checklist assigned to every new hire. The array order
 * is the display order (persisted as `order`). Keys map to i18n labels under
 * `onboarding.steps.<key>` in messages/{en,fr}.json. `as const` so the step keys
 * stay literal — the UI coerces DB values back to this union for typed i18n.
 */
export const ONBOARDING_TEMPLATE = [
  { key: "signContract", category: "PAPERWORK" },
  { key: "submitId", category: "PAPERWORK" },
  { key: "bankDetails", category: "PAPERWORK" },
  { key: "laptop", category: "EQUIPMENT" },
  { key: "accessBadge", category: "ACCESS" },
  { key: "accounts", category: "ACCESS" },
  { key: "securityTraining", category: "TRAINING" },
  { key: "handbookReview", category: "TRAINING" },
  { key: "teamIntro", category: "ORIENTATION" },
  { key: "managerMeeting", category: "ORIENTATION" },
] as const satisfies readonly { key: string; category: OnboardingCategory }[];

/** The literal union of known step keys (for typed i18n labels). */
export type OnboardingStepKey = (typeof ONBOARDING_TEMPLATE)[number]["key"];

export type OnboardingTaskView = {
  id: string;
  key: string;
  category: OnboardingCategory;
  order: number;
  status: OnboardingStatus;
  completedAt: Date | null;
};

export type OnboardingProgress = {
  total: number;
  done: number;
  /** 0–100, rounded. 100 when there are no steps (nothing outstanding). */
  percent: number;
};

export type OnboardingOverviewRow = {
  employeeId: string;
  name: string;
  title: string;
  department: string;
  progress: OnboardingProgress;
};

/** Cheap i18n coercions so the UI can map the enum to a message key safely. */
const CATEGORY_KEYS = ["PAPERWORK", "EQUIPMENT", "ACCESS", "TRAINING", "ORIENTATION"] as const;
export function asOnboardingCategory(v: string): (typeof CATEGORY_KEYS)[number] {
  return (CATEGORY_KEYS as readonly string[]).includes(v)
    ? (v as (typeof CATEGORY_KEYS)[number])
    : "PAPERWORK";
}

const STEP_KEYS = ONBOARDING_TEMPLATE.map((s) => s.key) as readonly OnboardingStepKey[];
export function asOnboardingStepKey(v: string): OnboardingStepKey {
  return (STEP_KEYS as readonly string[]).includes(v) ? (v as OnboardingStepKey) : STEP_KEYS[0];
}

export function computeProgress(tasks: { status: OnboardingStatus }[]): OnboardingProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  return { total, done, percent };
}

/**
 * Ensure an employee has their onboarding tasks, creating them from the template
 * on first use. Idempotent: it only seeds when the employee has none, so it is
 * safe to call on every read. Returns the employee's tasks, in display order.
 */
async function ensureTasks(employeeId: string): Promise<OnboardingTaskView[]> {
  const existing = await prisma.onboardingTask.findMany({
    where: { employeeId },
    orderBy: { order: "asc" },
  });
  if (existing.length > 0) return existing;

  await prisma.onboardingTask.createMany({
    data: ONBOARDING_TEMPLATE.map((step, i) => ({
      employeeId,
      key: step.key,
      category: step.category,
      order: i,
    })),
  });
  return prisma.onboardingTask.findMany({
    where: { employeeId },
    orderBy: { order: "asc" },
  });
}

/** The caller's own onboarding checklist (creating it on first visit). */
export async function getMyOnboarding(employeeId: string): Promise<OnboardingTaskView[]> {
  return ensureTasks(employeeId);
}

/**
 * Toggle one of the caller's own onboarding steps. Only the step's owner may
 * change it (HR sees progress read-only). Returns true on success, false if the
 * task does not belong to the caller — never throws a leak.
 */
export async function setMyOnboardingStatus(
  employeeId: string,
  taskId: string,
  status: OnboardingStatus,
): Promise<boolean> {
  const task = await prisma.onboardingTask.findUnique({
    where: { id: taskId },
    select: { employeeId: true },
  });
  if (task?.employeeId !== employeeId) return false;
  await prisma.onboardingTask.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
  return true;
}

/**
 * HR-wide onboarding progress, one row per active employee, newest hires first.
 * Gated on `directory:read:all` (HR / Super Admin) — anyone else gets []. Seeds
 * template tasks for employees who have none yet, so the overview is meaningful
 * before each new hire has opened their own checklist.
 */
export async function getOnboardingOverview(caller: Caller): Promise<OnboardingOverviewRow[]> {
  if (!can(caller.role, "directory:read:all")) return [];

  const employees = await prisma.employee.findMany({
    where: { status: { not: "TERMINATED" } },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      title: true,
      department: true,
      user: { select: { name: true } },
      onboardingTasks: { select: { status: true } },
    },
  });

  const rows: OnboardingOverviewRow[] = [];
  for (const e of employees) {
    // Backfill template tasks for anyone who has none, so the count is real.
    const tasks =
      e.onboardingTasks.length > 0
        ? e.onboardingTasks
        : (await ensureTasks(e.id)).map((t) => ({ status: t.status }));
    rows.push({
      employeeId: e.id,
      name: e.user?.name ?? "—",
      title: e.title,
      department: e.department,
      progress: computeProgress(tasks),
    });
  }
  return rows;
}
