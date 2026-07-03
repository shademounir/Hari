// UTC, day-precision date helpers for the KPI aggregation layer. Deliberately
// dependency-free (no date-fns yet — that arrives with the chart UI) and pure,
// so every calculator built on top stays unit-testable without a clock or a DB.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC on the same calendar day as `d`. */
export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO day key "YYYY-MM-DD" (UTC). */
export function dayKey(d: Date): string {
  return startOfDayUtc(d).toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(startOfDayUtc(d).getTime() + n * MS_PER_DAY);
}

/** Whole days from `a` to `b` (UTC, `b - a`). Negative if `b` precedes `a`. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDayUtc(b).getTime() - startOfDayUtc(a).getTime()) / MS_PER_DAY);
}

/** Inclusive list of day-start dates from `start` to `end`. */
export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const span = daysBetween(start, end);
  for (let i = 0; i <= span; i++) days.push(addDays(start, i));
  return days;
}

/**
 * Start of the bucket a date falls into, anchored at `rangeStart`:
 *  - "week"  → 7-day blocks measured from rangeStart (calendar-week-agnostic,
 *              but stable and testable);
 *  - "month" → first of the calendar month.
 */
export function bucketStart(d: Date, rangeStart: Date, granularity: "week" | "month"): Date {
  if (granularity === "month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  const offset = daysBetween(rangeStart, d);
  const weekIndex = Math.floor(offset / 7);
  return addDays(rangeStart, weekIndex * 7);
}
