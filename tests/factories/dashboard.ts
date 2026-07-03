// ─────────────────────────────────────────────────────────────────────────
// Deterministic mock factory for the Team dashboard (SCRUM-071 control-center).
// Generates realistic ~6-month datasets — overlapping leave, holiday clusters,
// AI-usage baselines with a refusal spike, and edge cases (empty team, a member
// on back-to-back leave) — as PLAIN data (Date/number), so the pure calculators
// in lib/kpi/* can be unit-tested without a database or a clock.
//
// Seeded PRNG (mulberry32) → same seed yields the same dataset, every run.
// ─────────────────────────────────────────────────────────────────────────
import type { LeaveInterval } from "@/lib/kpi/capacity";
import { MS_PER_DAY } from "@/lib/kpi/time";

// Re-exported so existing importers can keep sourcing it from the factory.
export { mulberry32 } from "@/lib/kpi/prng";
import { mulberry32 } from "@/lib/kpi/prng";

const dayUtc = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(dayUtc(d).getTime() + n * MS_PER_DAY);

export type DashboardFixtureOptions = {
  seed?: number;
  now?: Date; // reference "today" — anchors the 6-month window deterministically
  teamSize?: number;
  months?: number;
};

export type DashboardFixture = {
  now: Date;
  rangeStart: Date;
  rangeEnd: Date;
  employeeIds: string[];
  /** Approved-leave intervals (with intentional overlaps + a holiday cluster). */
  leaveIntervals: LeaveInterval[];
  /** Timestamps of assistant turns across the window (weekly-ish cadence). */
  aiTurnDates: Date[];
  /** Timestamps of tool refusals — mostly flat, with one deliberate spike week. */
  aiRefusalDates: Date[];
};

/**
 * Build a full fixture. Defaults: 8-person team, 6 months ending at a fixed
 * reference date, with:
 *  - a December holiday cluster (many overlapping absences),
 *  - one employee on long back-to-back leave (edge case),
 *  - an AI-refusal spike in the most recent week (anomaly target).
 */
export function buildDashboardFixture(options: DashboardFixtureOptions = {}): DashboardFixture {
  const {
    seed = 42,
    now = new Date(Date.UTC(2026, 5, 30)), // 2026-06-30, fixed for determinism
    teamSize = 8,
    months = 6,
  } = options;

  const rand = mulberry32(seed);
  const rangeEnd = dayUtc(now);
  const rangeStart = addDays(rangeEnd, -Math.round(months * 30));
  const spanDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY);

  const employeeIds = Array.from({ length: teamSize }, (_, i) => `emp_${i + 1}`);

  const leaveIntervals: LeaveInterval[] = [];

  // 1) Scattered ordinary leave: each member takes a few short absences.
  for (const employeeId of employeeIds) {
    const count = 2 + Math.floor(rand() * 3); // 2–4 absences
    for (let i = 0; i < count; i++) {
      const startOffset = Math.floor(rand() * (spanDays - 5));
      const length = 1 + Math.floor(rand() * 4); // 1–4 days
      const start = addDays(rangeStart, startOffset);
      leaveIntervals.push({ employeeId, start, end: addDays(start, length) });
    }
  }

  // 2) Holiday cluster: ~60% of the team overlaps a fixed late-December week.
  const holidayStart = new Date(Date.UTC(rangeStart.getUTCFullYear(), 11, 22));
  if (holidayStart >= rangeStart && holidayStart <= rangeEnd) {
    for (const employeeId of employeeIds) {
      if (rand() < 0.6) {
        const start = addDays(holidayStart, Math.floor(rand() * 2));
        leaveIntervals.push({ employeeId, start, end: addDays(start, 3 + Math.floor(rand() * 3)) });
      }
    }
  }

  // 3) Edge case: one member on a long, continuous absence.
  leaveIntervals.push({
    employeeId: employeeIds[0],
    start: addDays(rangeEnd, -20),
    end: addDays(rangeEnd, -6),
  });

  // 4) AI usage: a steady weekly baseline of turns across the window.
  const aiTurnDates: Date[] = [];
  for (let day = 0; day <= spanDays; day++) {
    const n = Math.floor(rand() * 4); // 0–3 turns/day
    for (let i = 0; i < n; i++) aiTurnDates.push(addDays(rangeStart, day));
  }

  // 5) AI refusals: rare baseline, plus a spike in the final week (anomaly).
  const aiRefusalDates: Date[] = [];
  for (let day = 0; day <= spanDays - 7; day++) {
    if (rand() < 0.05) aiRefusalDates.push(addDays(rangeStart, day));
  }
  for (let i = 0; i < 12; i++) {
    aiRefusalDates.push(addDays(rangeEnd, -Math.floor(rand() * 7)));
  }

  return { now: rangeEnd, rangeStart, rangeEnd, employeeIds, leaveIntervals, aiTurnDates, aiRefusalDates };
}
