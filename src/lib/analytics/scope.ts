// ─────────────────────────────────────────────────────────────────────────
// HARI-122 — the ONE scoping authority for HR analytics, mirroring lib/hr.ts's
// `directoryWhere`. `analytics:full` sees the whole company; `analytics:team`
// sees self + direct reports. Unlike the directory, analytics deliberately
// INCLUDES terminated employees (turnover, historical payroll need them).
// ─────────────────────────────────────────────────────────────────────────
import type { Prisma } from "@prisma/client";
import type { Caller } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { MS_PER_DAY } from "@/lib/kpi/time";
import type { AnalyticsFilters } from "./types";

export type AnalyticsScope = {
  where: Prisma.EmployeeWhereInput; // population in reach (incl. terminated)
  companyWide: boolean;
  canPayroll: boolean; // only full-access roles read salary/payroll
};

/** Null when the caller holds neither analytics permission. */
export function resolveAnalyticsScope(caller: Caller): AnalyticsScope | null {
  if (can(caller.role, "analytics:full")) {
    return { where: {}, companyWide: true, canPayroll: true };
  }
  if (can(caller.role, "analytics:team")) {
    const self = caller.employeeId ?? "__none__";
    return {
      where: { OR: [{ id: self }, { managerId: self }] },
      companyWide: false,
      canPayroll: false, // managers never see payroll
    };
  }
  return null;
}

/** Merge the role scope with the UI filters into a single Employee predicate. */
export function scopedEmployeeWhere(
  scope: AnalyticsScope,
  filters: AnalyticsFilters,
): Prisma.EmployeeWhereInput {
  const and: Prisma.EmployeeWhereInput[] = [scope.where];
  if (filters.department) and.push({ department: filters.department });
  if (filters.contractType) and.push({ contractType: filters.contractType });
  if (filters.level) and.push({ user: { role: filters.level } });
  return and.length === 1 ? and[0] : { AND: and };
}

const CONTRACT_TYPES = ["CDI", "CDD", "ALTERNANCE", "STAGE"] as const;
const LEVELS = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;
const PERIODS = ["month", "quarter", "semester", "year", "custom"] as const;

/**
 * Parse + validate UI filters from a query string. Invalid values are dropped
 * (never forwarded to Prisma), so a hand-crafted URL can't inject a bad filter.
 * Accepts anything with a `get(key)` method (URLSearchParams or Next's params).
 */
export function parseAnalyticsFilters(params: { get(key: string): string | null }): AnalyticsFilters {
  const one = <T extends readonly string[]>(key: string, allowed: T): T[number] | undefined => {
    const v = params.get(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T[number]) : undefined;
  };
  const department = params.get("department")?.trim() || undefined;
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  return {
    department,
    contractType: one("contractType", CONTRACT_TYPES),
    level: one("level", LEVELS),
    period: one("period", PERIODS),
    from,
    to,
  };
}

export type ResolvedPeriod = { start: Date; end: Date };

/** UTC midnight of the first day of the month `monthsAgo` before `ref`. */
export function monthStart(ref: Date, monthsAgo = 0): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - monthsAgo, 1));
}

/** UTC end-of-day of the last day of `ref`'s month. */
export function monthEnd(ref: Date): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/** "YYYY-MM" key for a date (UTC). */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Resolve a period preset (or custom range) to concrete [start, end] dates. */
export function resolvePeriod(filters: AnalyticsFilters, now: Date): ResolvedPeriod {
  const end = now;
  switch (filters.period) {
    case "custom": {
      const start = filters.from ? new Date(filters.from) : monthStart(now, 11);
      const stop = filters.to ? new Date(filters.to) : now;
      return { start, end: stop };
    }
    case "month":
      return { start: monthStart(now, 0), end };
    case "quarter":
      return { start: new Date(end.getTime() - 90 * MS_PER_DAY), end };
    case "semester":
      return { start: new Date(end.getTime() - 182 * MS_PER_DAY), end };
    case "year":
    default:
      return { start: new Date(end.getTime() - 365 * MS_PER_DAY), end };
  }
}

/** Count Mon–Fri days in [start, end] inclusive — the workable-days denominator. */
export function businessDays(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}
