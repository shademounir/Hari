// ─────────────────────────────────────────────────────────────────────────
// HARI-122 / SCRUM-097 — DETERMINISTIC HR-analytics facts.
// Seeds two time-series that the current schema can't derive from a single
// salary snapshot or from LeaveRequest alone:
//   • PayrollSnapshot  — 24 months of gross pay per employee (payroll curve,
//                        band + department breakdown over time).
//   • PerformanceReview — annual reviews, deliberately spread so some staff are
//                        up to date, some overdue (>12 mo), some never reviewed.
// Anchored to the seed-time "now" so the dashboard's rolling windows land on
// fresh data. PRNG-seeded, so a re-seed reproduces the exact same shape.
// Idempotent: guarded on payrollSnapshot.count().
// ─────────────────────────────────────────────────────────────────────────
import type { PrismaClient } from "@prisma/client";
import { mulberry32 } from "../src/lib/kpi/prng";

const PAYROLL_MONTHS = 24;

/** First day of the month, `monthsAgo` before `ref`, at UTC midnight. */
function monthStart(ref: Date, monthsAgo: number): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - monthsAgo, 1));
}

export async function seedAnalytics(prisma: PrismaClient, now = new Date()): Promise<void> {
  if ((await prisma.payrollSnapshot.count()) > 0) {
    console.log("• HR analytics facts already seeded — skipping.");
    return;
  }

  const employees = await prisma.employee.findMany({
    select: { id: true, salary: true, startDate: true, terminationDate: true, managerId: true },
  });
  const rand = mulberry32(20260707);

  // ── PayrollSnapshot: one row per (employee, month) the employee was on staff.
  const payroll: { employeeId: string; month: Date; grossAmount: number }[] = [];
  for (const e of employees) {
    const base = Math.round(e.salary / 12);
    for (let k = PAYROLL_MONTHS - 1; k >= 0; k--) {
      const month = monthStart(now, k);
      if (e.startDate > month) continue; // not hired yet
      if (e.terminationDate && e.terminationDate < month) continue; // already gone
      // Slight upward drift over time (older months paid a bit less) + ±1.5% noise,
      // so the curve trends up and the bands aren't perfectly flat.
      const drift = 1 - k * 0.0015;
      const noise = 1 + (rand() - 0.5) * 0.03;
      payroll.push({ employeeId: e.id, month, grossAmount: Math.round(base * drift * noise) });
    }
  }
  await prisma.payrollSnapshot.createMany({ data: payroll });

  // ── PerformanceReview: ~60% up-to-date, ~25% overdue (>12 mo), ~15% none.
  const reviews: { employeeId: string; reviewerId: string | null; conductedAt: Date }[] = [];
  for (const e of employees) {
    if (e.terminationDate) continue; // reviews only track current staff
    const roll = rand();
    let monthsAgo: number | null;
    if (roll < 0.6) monthsAgo = 1 + Math.floor(rand() * 11); // 1–11 mo ago (current)
    else if (roll < 0.85) monthsAgo = 13 + Math.floor(rand() * 8); // 13–20 mo ago (overdue)
    else monthsAgo = null; // never reviewed
    if (monthsAgo === null) continue;
    const d = monthStart(now, monthsAgo);
    reviews.push({
      employeeId: e.id,
      reviewerId: e.managerId ?? null,
      conductedAt: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15)),
    });
  }
  await prisma.performanceReview.createMany({ data: reviews });

  console.log(
    `• Seeded ${payroll.length} payroll snapshots + ${reviews.length} performance reviews.`,
  );
}
