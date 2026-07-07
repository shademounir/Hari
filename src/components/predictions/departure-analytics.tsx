"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projectDepartures, PROJECTION_MIN_HEADCOUNT } from "@/lib/predictive/projection";
import { displayBand } from "./risk-band-badge";

// Privacy-safe chart rows (no names/salary — just department + score + band).
export type AnalyticsRow = { department: string; score: number };

const BAND_COLORS = { green: "#10b981", orange: "#f59e0b", red: "#ef4444" } as const;
const ACCENT = "#6366f1"; // cumulative
const ACCENT_2 = "#94a3b8"; // per-month

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

// Client island for the two enterprise charts. A single department filter drives
// BOTH: the 12-month projection (recharts area/line) and the risk distribution
// (stacked bar). Filtering is client-side state (fast, no reload) — distinct from
// the table's URL-based filters, which must be shareable.
export function DepartureAnalytics({
  rows,
  departments,
  activeCount,
  asOf,
}: {
  rows: AnalyticsRow[];
  departments: string[];
  activeCount: number;
  asOf: string; // ISO — the reference "now" for month labels
}) {
  const t = useTranslations("predictions.projection");
  const tDist = useTranslations("predictions.distribution");
  const tBand = useTranslations("predictions.band");
  const locale = useLocale();
  const [dept, setDept] = useState<string>("all");

  const filtered = useMemo(
    () => (dept === "all" ? rows : rows.filter((r) => r.department === dept)),
    [rows, dept],
  );

  // Chart 1 — projection over the filtered population.
  const projectionData = useMemo(() => {
    const base = new Date(asOf);
    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    return projectDepartures(filtered.map((r) => r.score)).points.map((p) => {
      const d = new Date(base);
      d.setMonth(d.getMonth() + p.monthIndex);
      return {
        label: monthFmt.format(d),
        cumulative: Number(p.cumulative.toFixed(2)),
        expected: Number(p.expected.toFixed(2)),
      };
    });
  }, [filtered, asOf, locale]);

  // Chart 2 — green/orange/red counts per department (or the single one selected).
  const distributionData = useMemo(() => {
    const depts = dept === "all" ? departments : [dept];
    return depts.map((d) => {
      const bucket = { department: d, green: 0, orange: 0, red: 0 };
      for (const r of rows) {
        if (r.department !== d) continue;
        bucket[displayBand(r.score)] += 1;
      }
      return bucket;
    });
  }, [rows, departments, dept]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <Select value={dept} onValueChange={(v) => v && setDept(v)}>
          <SelectTrigger size="sm" className="w-48" aria-label={tDist("filterLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tDist("allCompany")}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {activeCount < PROJECTION_MIN_HEADCOUNT ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <LineChartIcon className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">{t("calibrating")}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {t("calibratingHint", { min: PROJECTION_MIN_HEADCOUNT, have: activeCount })}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Chart 1 — 12-month projection */}
          <div className="rounded-xl border bg-card/50 p-4">
            <h3 className="mb-3 text-sm font-semibold">{t("chartTitle")}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={projectionData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="cumulative" name={t("legendCumulative")} stroke={ACCENT} strokeWidth={2.5} fill="url(#cumFill)" />
                <Line type="monotone" dataKey="expected" name={t("legendMonthly")} stroke={ACCENT_2} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — risk distribution by department */}
          <div className="rounded-xl border bg-card/50 p-4">
            <h3 className="mb-3 text-sm font-semibold">{tDist("title")}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distributionData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="green" stackId="risk" name={tBand("green")} fill={BAND_COLORS.green} radius={[0, 0, 0, 0]} />
                <Bar dataKey="orange" stackId="risk" name={tBand("orange")} fill={BAND_COLORS.orange} />
                <Bar dataKey="red" stackId="risk" name={tBand("red")} fill={BAND_COLORS.red} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
