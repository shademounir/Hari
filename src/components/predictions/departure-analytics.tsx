"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LineChart as LineChartIcon, ChevronDown, Check, Building2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { projectDepartures, PROJECTION_MIN_HEADCOUNT } from "@/lib/predictive/projection";
import { displayBand } from "./risk-band-badge";

// Privacy-safe chart rows (no names/salary — just department + score).
export type AnalyticsRow = { department: string; score: number };

type Period = "month" | "quarter" | "year";
type ProjStyle = "area" | "line" | "bar";

const BAND_COLORS = { green: "#10b981", orange: "#f59e0b", red: "#ef4444" } as const;
const ACCENT = "#6366f1"; // cumulative
const ACCENT_2 = "#94a3b8"; // per-period

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

const round2 = (n: number) => Number(n.toFixed(2));

type Point = { label: string; expected: number; cumulative: number };

/** Bucket the 12-month projection to the chosen granularity. */
function bucketProjection(
  scores: number[],
  period: Period,
  base: Date,
  locale: string,
  quarterShort: string,
): Point[] {
  const { points, totalExpected } = projectDepartures(scores);

  if (period === "quarter") {
    const out: Point[] = [];
    for (let q = 0; q < 4; q++) {
      const slice = points.slice(q * 3, q * 3 + 3);
      const expected = slice.reduce((s, p) => s + p.expected, 0);
      out.push({
        label: `${quarterShort}${q + 1}`,
        expected: round2(expected),
        cumulative: round2(slice[slice.length - 1].cumulative),
      });
    }
    return out;
  }

  if (period === "year") {
    return [{ label: String(base.getFullYear()), expected: round2(totalExpected), cumulative: round2(totalExpected) }];
  }

  // month (default)
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  return points.map((p) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + p.monthIndex);
    return { label: monthFmt.format(d), expected: round2(p.expected), cumulative: round2(p.cumulative) };
  });
}

// Client island for the two enterprise charts. Shared controls (multi-department
// select + period) drive BOTH charts; each chart has its own style toggle.
// Filtering is client-side state (fast, no reload) — distinct from the table's
// URL-based filters, which must be shareable.
export function DepartureAnalytics({
  rows,
  departments,
  activeCount,
  asOf,
}: {
  rows: AnalyticsRow[];
  departments: string[];
  activeCount: number;
  asOf: string; // ISO — the reference "now" for period labels
}) {
  const t = useTranslations("predictions.projection");
  const tDist = useTranslations("predictions.distribution");
  const tBand = useTranslations("predictions.band");
  const tc = useTranslations("predictions.controls");
  const tp = useTranslations("predictions.period");
  const ts = useTranslations("predictions.chartStyle");
  const locale = useLocale();

  const [selected, setSelected] = useState<string[]>([]); // empty = all company
  const [period, setPeriod] = useState<Period>("month");
  const [projStyle, setProjStyle] = useState<ProjStyle>("area");
  const [stacked, setStacked] = useState(true);

  // Departments in play (empty selection = every department).
  const activeDepts = selected.length ? departments.filter((d) => selected.includes(d)) : departments;

  const filteredScores = useMemo(
    () => rows.filter((r) => activeDepts.includes(r.department)).map((r) => r.score),
    [rows, activeDepts],
  );

  const projectionData = useMemo(
    () => bucketProjection(filteredScores, period, new Date(asOf), locale, tc("quarterShort")),
    [filteredScores, period, asOf, locale, tc],
  );

  const distributionData = useMemo(
    () =>
      activeDepts.map((d) => {
        const bucket = { department: d, green: 0, orange: 0, red: 0 };
        for (const r of rows) {
          if (r.department === d) bucket[displayBand(r.score)] += 1;
        }
        return bucket;
      }),
    [rows, activeDepts],
  );

  return (
    <div className="space-y-4">
      {/* Shared controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <MultiSelect
          options={departments}
          selected={selected}
          onChange={setSelected}
          allLabel={tc("allDepartments")}
          triggerLabel={tc("departments")}
          selectedLabel={(n) => tc("selected", { count: n })}
        />
        <LabeledSegmented
          label={tc("period")}
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: tp("month") },
            { value: "quarter", label: tp("quarter") },
            { value: "year", label: tp("year") },
          ]}
        />
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("chartTitle")}</h3>
              <Segmented
                value={projStyle}
                onChange={setProjStyle}
                options={[
                  { value: "area", label: ts("area") },
                  { value: "line", label: ts("line") },
                  { value: "bar", label: ts("bar") },
                ]}
              />
            </div>
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
                <Legend wrapperStyle={{ fontSize: 12 }} />

                {projStyle === "area" && (
                  <Area type="monotone" dataKey="cumulative" name={t("legendCumulative")} stroke={ACCENT} strokeWidth={2.5} fill="url(#cumFill)" />
                )}
                {projStyle === "line" && (
                  <Line type="monotone" dataKey="cumulative" name={t("legendCumulative")} stroke={ACCENT} strokeWidth={2.5} dot={{ r: 2.5 }} />
                )}
                {projStyle === "bar" && (
                  <Bar dataKey="expected" name={t("legendMonthly")} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={48} />
                )}

                {/* Secondary series: on area/line show per-period line; on bar overlay the cumulative line. */}
                {projStyle === "bar" ? (
                  <Line type="monotone" dataKey="cumulative" name={t("legendCumulative")} stroke={ACCENT_2} strokeWidth={2} dot={false} />
                ) : (
                  <Line type="monotone" dataKey="expected" name={t("legendMonthly")} stroke={ACCENT_2} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — risk distribution by department */}
          <div className="rounded-xl border bg-card/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{tDist("title")}</h3>
              <Segmented
                value={stacked ? "stacked" : "grouped"}
                onChange={(v) => setStacked(v === "stacked")}
                options={[
                  { value: "stacked", label: tc("stacked") },
                  { value: "grouped", label: tc("grouped") },
                ]}
              />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distributionData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="green" stackId={stacked ? "risk" : undefined} name={tBand("green")} fill={BAND_COLORS.green} radius={stacked ? [0, 0, 0, 0] : [3, 3, 0, 0]} />
                <Bar dataKey="orange" stackId={stacked ? "risk" : undefined} name={tBand("orange")} fill={BAND_COLORS.orange} radius={stacked ? [0, 0, 0, 0] : [3, 3, 0, 0]} />
                <Bar dataKey="red" stackId={stacked ? "risk" : undefined} name={tBand("red")} fill={BAND_COLORS.red} radius={stacked ? [4, 4, 0, 0] : [3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small controls ───────────────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LabeledSegmented<T extends string>(props: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <Segmented value={props.value} onChange={props.onChange} options={props.options} />
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  triggerLabel,
  selectedLabel,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  triggerLabel: string;
  selectedLabel: (count: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (d: string) =>
    onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d]);

  const summary =
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : selectedLabel(selected.length);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={triggerLabel}
        className="inline-flex h-8 items-center gap-2 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
      >
        <Building2 className="size-3.5 text-muted-foreground" />
        <span className="max-w-[10rem] truncate">{summary}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {allLabel}
              {selected.length === 0 && <Check className="size-3.5 text-primary" />}
            </button>
            {options.map((d) => {
              const checked = selected.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-primary bg-primary" : "border-input",
                    )}
                  >
                    {checked && <Check className="size-3 text-primary-foreground" />}
                  </span>
                  <span className="truncate">{d}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
