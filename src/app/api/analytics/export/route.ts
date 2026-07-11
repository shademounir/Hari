// HARI-122 — CSV export for the HR analytics sections. Same RBAC gate + scope
// as the dashboard (getHrAnalytics returns null → 403), so the export can never
// reveal more than the page. `?section=` picks which filtered dataset to emit.
import { auth } from "@/lib/auth";
import { getHrAnalytics } from "@/lib/analytics";
import { parseAnalyticsFilters } from "@/lib/analytics/scope";

type Cell = string | number;

function toCsv(header: string[], rows: Cell[][]): string {
  const esc = (c: Cell) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const section = url.searchParams.get("section") ?? "overview";
  const filters = parseAnalyticsFilters(url.searchParams);

  const model = await getHrAnalytics(
    { role: session.user.role, employeeId: session.user.employeeId },
    filters,
    new Date(),
  );
  if (!model) return new Response("Forbidden", { status: 403 });

  let csv: string;
  switch (section) {
    case "absenteeism":
      csv = toCsv(
        ["month", "rate_pct"],
        model.absenteeism.byMonth.map((p) => [p.month, p.value]),
      );
      break;
    case "turnover":
      csv = toCsv(
        ["month", "departures"],
        model.turnover.byMonth.map((p) => [p.month, p.value]),
      );
      break;
    case "payroll":
      if (!model.payroll) return new Response("Forbidden", { status: 403 });
      csv = toCsv(
        ["month", "gross_total"],
        model.payroll.byMonth.map((p) => [p.month, p.value]),
      );
      break;
    case "reviews":
      csv = toCsv(
        ["employee", "department", "last_review"],
        model.reviews.overdue.map((r) => [r.name, r.department, r.lastReviewedAt ?? ""]),
      );
      break;
    default:
      csv = toCsv(
        ["metric", "value"],
        [
          ["headcount", model.overview.headcount.value],
          ["absenteeism_pct", model.overview.absenteeismPct.value],
          ["turnover_pct", model.overview.turnoverPct],
          ["monthly_payroll", model.payroll?.currentMonthTotal ?? ""],
          ["avg_time_to_hire_days", model.overview.avgTimeToHireDays],
        ],
      );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-${section}.csv"`,
    },
  });
}
