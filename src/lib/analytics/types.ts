// ─────────────────────────────────────────────────────────────────────────
// HARI-122 / SCRUM-097 — view-model types for the HR analytics dashboard.
// Every model is an aggregate (counts / rates / bands) — no salary-per-person,
// no PII beyond the review-follow-up list, which is HR-only by gate.
// ─────────────────────────────────────────────────────────────────────────
import type { ContractType, DepartureReason, Gender } from "@prisma/client";
import type { Role } from "@/lib/rbac";

/** A resolved reporting window. Presets collapse to concrete start/end dates. */
export type PeriodPreset = "month" | "quarter" | "semester" | "year" | "custom";

export type AnalyticsFilters = {
  department?: string;
  contractType?: ContractType;
  level?: Role; // hierarchical level (EMPLOYEE / MANAGER / HR_ADMIN …)
  period?: PeriodPreset;
  from?: string; // ISO date — only when period = "custom"
  to?: string; // ISO date
};

export type DeltaKpi = {
  value: number;
  previous: number; // comparison basis (prev month / N-1)
  deltaPct: number; // signed % change vs `previous`, 0 when previous = 0
};

/** Section 1 — headline KPI cards. */
export type OverviewModel = {
  headcount: DeltaKpi; // active employees, vs previous month
  absenteeismPct: DeltaKpi; // % of workable days lost, vs same period N-1
  turnoverPct: number; // rolling 12-month turnover %
  monthlyPayroll: DeltaKpi | null; // gross, vs previous month — null when payroll not permitted
  avgTimeToHireDays: number; // mean recruitment lead time
};

export type MonthPoint = { month: string; value: number }; // month = "YYYY-MM"
export type Slice = { key: string; value: number }; // generic labelled slice
export type DeptRate = { department: string; ratePct: number; days: number };

/** Section 2 — absenteeism. */
export type AbsenteeismModel = {
  ratePct: number;
  previousYearPct: number;
  byMonth: MonthPoint[]; // last 12 months, rate %
  byType: Slice[]; // days by leave type
  topDepartments: DeptRate[]; // worst 5 by rate
};

export type TenureBucket = "lt1y" | "y1to3" | "gt3y";

/** Section 3 — turnover. */
export type TurnoverModel = {
  ratePct: number; // rolling 12-month
  byMonth: MonthPoint[]; // departures per month, last 24 months
  byReason: Slice[]; // DepartureReason distribution
  byTenure: Slice[]; // leavers by tenure bucket
  topDepartments: Slice[]; // departures per department (top 5)
};

/** Section 4 — payroll (company-wide, gated). */
export type PayrollModel = {
  byMonth: MonthPoint[]; // total gross, last 12 months
  byBand: Slice[]; // headcount per salary band
  byDepartment: Slice[]; // current-month gross per department
  currentMonthTotal: number;
};

export type AgeBandRow = { band: string; female: number; male: number; other: number; total: number };
export type GenderByLevelRow = { level: Role; female: number; male: number; other: number };
export type DeptTenure = { department: string; avgTenureYears: number };

/** Section 5 — age pyramid + diversity. */
export type DiversityModel = {
  ageBands: AgeBandRow[];
  genderByLevel: GenderByLevelRow[];
  tenureByDepartment: DeptTenure[];
};

export type OverdueReview = {
  employeeId: string;
  name: string;
  department: string;
  lastReviewedAt: string | null; // ISO date, null = never
};

/** Section 6 — annual reviews. */
export type ReviewStatusModel = {
  reviewedThisYearPct: number;
  totalConsidered: number;
  overdue: OverdueReview[]; // no review in > 12 months (HR follow-up list)
};

/** The full company dashboard (HR/Admin). */
export type HrAnalyticsModel = {
  overview: OverviewModel;
  absenteeism: AbsenteeismModel;
  turnover: TurnoverModel;
  payroll: PayrollModel | null; // null when the caller can't see payroll
  diversity: DiversityModel;
  reviews: ReviewStatusModel;
  departments: string[]; // facet for the filter bar
};

/** The Manager view — a scoped subset, no payroll. */
export type TeamAnalyticsModel = {
  headcount: number;
  onLeaveNow: number;
  reviewsToPlan: number; // reports overdue for a review
  absenteeism: AbsenteeismModel;
  overdueReviews: OverdueReview[];
};

// Re-export enums used in view models so pages import from one place.
export type { ContractType, DepartureReason, Gender, Role };
