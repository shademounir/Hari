// ─────────────────────────────────────────────────────────────────────────
// HARI-122 / SCRUM-097 — the single server-side assembler for the HR analytics
// dashboard. RBAC-gated (analytics:full = company, analytics:team = own team),
// scoped through `resolveAnalyticsScope` (the one authority). Every value is an
// aggregate; salary/payroll is only computed when `canPayroll`. Heavy company-
// wide reads are cached hourly by `getHrAnalyticsCached` (the page entry point).
// ─────────────────────────────────────────────────────────────────────────
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Caller } from "@/lib/hr";
import { MS_PER_DAY } from "@/lib/kpi/time";
import {
  businessDays,
  monthEnd,
  monthKey,
  monthStart,
  resolveAnalyticsScope,
  resolvePeriod,
  scopedEmployeeWhere,
  type AnalyticsScope,
} from "./scope";
import type {
  AbsenteeismModel,
  AnalyticsFilters,
  DiversityModel,
  HrAnalyticsModel,
  OverviewModel,
  PayrollModel,
  ReviewStatusModel,
  Slice,
  TeamAnalyticsModel,
  TurnoverModel,
} from "./types";

const YEAR_MS = 365 * MS_PER_DAY;

/** Annual-salary bands (in the org currency; keys map to i18n labels). Chosen to
 * fit the seed's MAD annual salaries — the four-band shape follows the ticket. */
const SALARY_BANDS: { key: string; max: number }[] = [
  { key: "lt120k", max: 120_000 },
  { key: "120to180k", max: 180_000 },
  { key: "180to250k", max: 250_000 },
  { key: "gte250k", max: Infinity },
];

const AGE_BANDS = ["20-30", "30-40", "40-50", "50-60", "60+"] as const;

type EmpRow = {
  id: string;
  salary: number;
  department: string;
  startDate: Date;
  leftAt: Date | null;
  departureReason: string | null;
  birthDate: Date | null;
  gender: "FEMALE" | "MALE" | "OTHER" | null;
  status: string;
  timeToHireDays: number | null;
  user: { role: string; name: string } | null;
};

const isActiveAsOf = (e: EmpRow, at: Date): boolean =>
  e.startDate <= at && (!e.leftAt || e.leftAt > at);
const isActiveNow = (e: EmpRow): boolean => e.status !== "TERMINATED";

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const deltaPct = (value: number, previous: number): number =>
  previous > 0 ? Math.round(((value - previous) / previous) * 1000) / 10 : 0;

// ── Section builders ──────────────────────────────────────────────────────

function buildAbsenteeism(
  emps: EmpRow[],
  leaves: { employeeId: string; type: string; days: number; startDate: Date; department: string }[],
  period: { start: Date; end: Date },
): AbsenteeismModel {
  const sickDaysIn = (from: Date, to: Date) =>
    leaves
      .filter((l) => l.type === "SICK" && l.startDate >= from && l.startDate <= to)
      .reduce((s, l) => s + l.days, 0);

  const headcountAsOf = (at: Date) => emps.filter((e) => isActiveAsOf(e, at)).length;
  const rateOver = (from: Date, to: Date) => {
    const workable = headcountAsOf(to) * businessDays(from, to);
    return pct(sickDaysIn(from, to), workable);
  };

  // 12-month trend of the monthly rate.
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const start = monthStart(period.end, 11 - i);
    const end = monthEnd(start);
    return { month: monthKey(start), value: rateOver(start, end) };
  });

  // Days by leave type over the period.
  const typeDays: Record<string, number> = { VACATION: 0, SICK: 0, PERSONAL: 0 };
  for (const l of leaves) {
    if (l.startDate >= period.start && l.startDate <= period.end) typeDays[l.type] += l.days;
  }
  const byType: Slice[] = Object.entries(typeDays).map(([key, value]) => ({ key, value }));

  // Top departments by absenteeism rate over the period.
  const deptHeads = new Map<string, number>();
  for (const e of emps) if (isActiveNow(e)) deptHeads.set(e.department, (deptHeads.get(e.department) ?? 0) + 1);
  const deptSick = new Map<string, number>();
  for (const l of leaves) {
    if (l.type === "SICK" && l.startDate >= period.start && l.startDate <= period.end) {
      deptSick.set(l.department, (deptSick.get(l.department) ?? 0) + l.days);
    }
  }
  const bd = businessDays(period.start, period.end);
  const topDepartments = [...deptSick.entries()]
    .map(([department, days]) => ({
      department,
      days,
      ratePct: pct(days, (deptHeads.get(department) ?? 1) * bd),
    }))
    .sort((a, b) => b.ratePct - a.ratePct)
    .slice(0, 5);

  const prevStart = new Date(period.start.getTime() - YEAR_MS);
  const prevEnd = new Date(period.end.getTime() - YEAR_MS);

  return {
    ratePct: rateOver(period.start, period.end),
    previousYearPct: rateOver(prevStart, prevEnd),
    byMonth,
    byType,
    topDepartments,
  };
}

function buildTurnover(emps: EmpRow[], now: Date): TurnoverModel {
  const leavers = emps.filter((e) => e.leftAt);
  const twelveAgo = new Date(now.getTime() - YEAR_MS);
  const departures12 = leavers.filter((e) => e.leftAt! > twelveAgo);

  const headNow = emps.filter((e) => isActiveAsOf(e, now)).length;
  const headThen = emps.filter((e) => isActiveAsOf(e, twelveAgo)).length;
  const avgHead = (headNow + headThen) / 2;
  const ratePct = pct(departures12.length, avgHead);

  const byMonth = Array.from({ length: 24 }, (_, i) => {
    const start = monthStart(now, 23 - i);
    const end = monthEnd(start);
    return {
      month: monthKey(start),
      value: leavers.filter((e) => e.leftAt! >= start && e.leftAt! <= end).length,
    };
  });

  const window = leavers.filter((e) => e.leftAt! > new Date(now.getTime() - 2 * YEAR_MS));
  const reasonCounts = new Map<string, number>();
  for (const e of window) reasonCounts.set(e.departureReason ?? "VOLUNTARY", (reasonCounts.get(e.departureReason ?? "VOLUNTARY") ?? 0) + 1);
  const byReason: Slice[] = [...reasonCounts.entries()].map(([key, value]) => ({ key, value }));

  const tenure = { lt1y: 0, y1to3: 0, gt3y: 0 };
  for (const e of window) {
    const years = (e.leftAt!.getTime() - e.startDate.getTime()) / YEAR_MS;
    if (years < 1) tenure.lt1y++;
    else if (years < 3) tenure.y1to3++;
    else tenure.gt3y++;
  }
  const byTenure: Slice[] = Object.entries(tenure).map(([key, value]) => ({ key, value }));

  const deptCounts = new Map<string, number>();
  for (const e of window) deptCounts.set(e.department, (deptCounts.get(e.department) ?? 0) + 1);
  const topDepartments = [...deptCounts.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return { ratePct, byMonth, byReason, byTenure, topDepartments };
}

function buildPayroll(
  emps: EmpRow[],
  snapshots: { month: Date; grossAmount: number; department: string }[],
  now: Date,
): PayrollModel {
  const byMonthMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) byMonthMap.set(monthKey(monthStart(now, i)), 0);
  for (const s of snapshots) {
    const k = monthKey(s.month);
    if (byMonthMap.has(k)) byMonthMap.set(k, (byMonthMap.get(k) ?? 0) + s.grossAmount);
  }
  const byMonth = [...byMonthMap.entries()].map(([month, value]) => ({ month, value }));

  const bands = SALARY_BANDS.map((b) => ({ key: b.key, value: 0 }));
  for (const e of emps) {
    if (!isActiveNow(e)) continue;
    const idx = SALARY_BANDS.findIndex((b) => e.salary < b.max);
    bands[idx === -1 ? bands.length - 1 : idx].value++;
  }

  const currentKey = monthKey(monthStart(now, 0));
  const deptMap = new Map<string, number>();
  for (const s of snapshots) {
    if (monthKey(s.month) === currentKey) deptMap.set(s.department, (deptMap.get(s.department) ?? 0) + s.grossAmount);
  }
  const byDepartment = [...deptMap.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);

  return {
    byMonth,
    byBand: bands,
    byDepartment,
    currentMonthTotal: byMonthMap.get(currentKey) ?? 0,
  };
}

function buildDiversity(emps: EmpRow[], now: Date): DiversityModel {
  const active = emps.filter(isActiveNow);
  const ageBands = AGE_BANDS.map((band) => ({ band, female: 0, male: 0, other: 0, total: 0 }));
  const bandIndex = (age: number) => (age < 30 ? 0 : age < 40 ? 1 : age < 50 ? 2 : age < 60 ? 3 : 4);
  const bump = (row: { female: number; male: number; other: number; total: number }, g: string | null) => {
    if (g === "FEMALE") row.female++;
    else if (g === "MALE") row.male++;
    else row.other++;
    row.total++;
  };
  for (const e of active) {
    if (!e.birthDate) continue;
    const age = Math.floor((now.getTime() - e.birthDate.getTime()) / YEAR_MS);
    bump(ageBands[bandIndex(age)], e.gender);
  }

  const levelMap = new Map<string, { level: string; female: number; male: number; other: number }>();
  for (const e of active) {
    const level = e.user?.role ?? "EMPLOYEE";
    const row = levelMap.get(level) ?? { level, female: 0, male: 0, other: 0 };
    if (e.gender === "FEMALE") row.female++;
    else if (e.gender === "MALE") row.male++;
    else row.other++;
    levelMap.set(level, row);
  }

  const deptTenure = new Map<string, { sum: number; n: number }>();
  for (const e of active) {
    const years = (now.getTime() - e.startDate.getTime()) / YEAR_MS;
    const agg = deptTenure.get(e.department) ?? { sum: 0, n: 0 };
    agg.sum += years;
    agg.n++;
    deptTenure.set(e.department, agg);
  }

  return {
    ageBands,
    genderByLevel: [...levelMap.values()].map((r) => ({
      level: r.level as DiversityModel["genderByLevel"][number]["level"],
      female: r.female,
      male: r.male,
      other: r.other,
    })),
    tenureByDepartment: [...deptTenure.entries()].map(([department, { sum, n }]) => ({
      department,
      avgTenureYears: Math.round((sum / n) * 10) / 10,
    })),
  };
}

function buildReviews(
  emps: EmpRow[],
  lastReviewByEmp: Map<string, Date>,
  now: Date,
): ReviewStatusModel {
  const active = emps.filter(isActiveNow);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const twelveAgo = new Date(now.getTime() - YEAR_MS);
  let reviewedThisYear = 0;
  const overdue: ReviewStatusModel["overdue"] = [];
  for (const e of active) {
    const last = lastReviewByEmp.get(e.id) ?? null;
    if (last && last >= yearStart) reviewedThisYear++;
    if (!last || last < twelveAgo) {
      overdue.push({
        employeeId: e.id,
        name: e.user?.name ?? "—",
        department: e.department,
        lastReviewedAt: last ? last.toISOString().slice(0, 10) : null,
      });
    }
  }
  return {
    reviewedThisYearPct: pct(reviewedThisYear, active.length),
    totalConsidered: active.length,
    overdue: overdue.sort((a, b) => (a.lastReviewedAt ?? "").localeCompare(b.lastReviewedAt ?? "")),
  };
}

// ── Shared data fetch ───────────────────────────────────────────────────────

async function fetchData(scope: AnalyticsScope, filters: AnalyticsFilters, now: Date) {
  const where = scopedEmployeeWhere(scope, filters);
  const emps = (await prisma.employee.findMany({
    where,
    select: {
      id: true,
      salary: true,
      department: true,
      startDate: true,
      leftAt: true,
      departureReason: true,
      birthDate: true,
      gender: true,
      status: true,
      timeToHireDays: true,
      user: { select: { role: true, name: true } },
    },
  })) as EmpRow[];
  const ids = emps.map((e) => e.id);

  const leaveRows = await prisma.leaveRequest.findMany({
    where: { employeeId: { in: ids }, status: "APPROVED" },
    select: { employeeId: true, type: true, days: true, startDate: true, employee: { select: { department: true } } },
  });
  const leaves = leaveRows.map((l) => ({
    employeeId: l.employeeId,
    type: l.type as string,
    days: l.days,
    startDate: l.startDate,
    department: l.employee.department,
  }));

  const reviewRows = await prisma.performanceReview.findMany({
    where: { employeeId: { in: ids } },
    select: { employeeId: true, conductedAt: true },
    orderBy: { conductedAt: "desc" },
  });
  const lastReviewByEmp = new Map<string, Date>();
  for (const r of reviewRows) if (!lastReviewByEmp.has(r.employeeId)) lastReviewByEmp.set(r.employeeId, r.conductedAt);

  let snapshots: { month: Date; grossAmount: number; department: string }[] = [];
  if (scope.canPayroll) {
    const snapRows = await prisma.payrollSnapshot.findMany({
      where: { employeeId: { in: ids }, month: { gte: monthStart(now, 11) } },
      select: { month: true, grossAmount: true, employee: { select: { department: true } } },
    });
    snapshots = snapRows.map((s) => ({ month: s.month, grossAmount: s.grossAmount, department: s.employee.department }));
  }

  return { emps, leaves, lastReviewByEmp, snapshots };
}

// ── Assemblers ──────────────────────────────────────────────────────────────

/**
 * The full company (or team) analytics model. Returns null when the caller holds
 * neither analytics permission — the page redirects. `now` is explicit so the
 * integration suite is deterministic; the page uses `getHrAnalyticsCached`.
 */
export async function getHrAnalytics(
  caller: Caller,
  filters: AnalyticsFilters,
  now: Date,
): Promise<HrAnalyticsModel | null> {
  const scope = resolveAnalyticsScope(caller);
  if (!scope) return null;

  const { emps, leaves, lastReviewByEmp, snapshots } = await fetchData(scope, filters, now);
  const period = resolvePeriod(filters, now);

  const absenteeism = buildAbsenteeism(emps, leaves, period);
  const turnover = buildTurnover(emps, now);
  const payroll = scope.canPayroll ? buildPayroll(emps, snapshots, now) : null;
  const diversity = buildDiversity(emps, now);
  const reviews = buildReviews(emps, lastReviewByEmp, now);
  const overview = buildOverview(emps, absenteeism, turnover, payroll, now);

  const departments = [...new Set(emps.map((e) => e.department))].sort();

  return { overview, absenteeism, turnover, payroll, diversity, reviews, departments };
}

function buildOverview(
  emps: EmpRow[],
  absenteeism: AbsenteeismModel,
  turnover: TurnoverModel,
  payroll: PayrollModel | null,
  now: Date,
): OverviewModel {
  const headNow = emps.filter((e) => isActiveAsOf(e, now)).length;
  const prevMonthEnd = monthEnd(monthStart(now, 1));
  const headPrev = emps.filter((e) => isActiveAsOf(e, prevMonthEnd)).length;

  const hires = emps.filter((e) => e.timeToHireDays != null && isActiveNow(e));
  const avgTimeToHireDays = hires.length
    ? Math.round(hires.reduce((s, e) => s + (e.timeToHireDays ?? 0), 0) / hires.length)
    : 0;

  let monthlyPayroll: OverviewModel["monthlyPayroll"] = null;
  if (payroll) {
    const cur = payroll.byMonth.at(-1)?.value ?? 0;
    const prev = payroll.byMonth.at(-2)?.value ?? 0;
    monthlyPayroll = { value: cur, previous: prev, deltaPct: deltaPct(cur, prev) };
  }

  return {
    headcount: { value: headNow, previous: headPrev, deltaPct: deltaPct(headNow, headPrev) },
    absenteeismPct: {
      value: absenteeism.ratePct,
      previous: absenteeism.previousYearPct,
      deltaPct: deltaPct(absenteeism.ratePct, absenteeism.previousYearPct),
    },
    turnoverPct: turnover.ratePct,
    monthlyPayroll,
    avgTimeToHireDays,
  };
}

/** Manager view — team-scoped subset, never payroll. */
export async function getTeamAnalytics(
  caller: Caller,
  filters: AnalyticsFilters,
  now: Date,
): Promise<TeamAnalyticsModel | null> {
  const full = await getHrAnalytics(caller, filters, now);
  if (!full) return null;
  const scope = resolveAnalyticsScope(caller)!;
  const { emps } = await fetchData(scope, filters, now);
  const headcount = emps.filter((e) => e.status !== "TERMINATED").length;
  const onLeaveNow = emps.filter((e) => e.status === "ON_LEAVE").length;
  return {
    headcount,
    onLeaveNow,
    reviewsToPlan: full.reviews.overdue.length,
    absenteeism: full.absenteeism,
    overdueReviews: full.reviews.overdue,
  };
}

/**
 * Page entry point for HR/Admin: caches the company-wide model for an hour
 * (heavy payroll/turnover aggregates). Keyed by role + team + filter signature;
 * `now` is read fresh inside so month buckets roll over correctly.
 */
export function getHrAnalyticsCached(
  caller: Caller,
  filters: AnalyticsFilters,
): Promise<HrAnalyticsModel | null> {
  const key = ["hr-analytics", caller.role, caller.employeeId ?? "-", JSON.stringify(filters)];
  return unstable_cache(() => getHrAnalytics(caller, filters, new Date()), key, {
    revalidate: 3600,
    tags: ["analytics"],
  })();
}
