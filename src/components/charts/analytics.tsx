"use client";

// HARI-122 — reusable, theme-aware Recharts wrappers for the HR analytics
// dashboard. All colors come from the app's `--chart-*` design tokens (so they
// track light/dark automatically). Data arrives with labels ALREADY localized
// by the server pages, so these components carry no i18n. Every chart is
// responsive (ResponsiveContainer) and has a click-to-toggle legend.
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Sequential blue→teal ramp — for SINGLE-series bars/lines where magnitude, not
// identity, is what the color conveys.
const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

// Distinct hues for CATEGORICAL data (pie slices, stacked series) where adjacent
// segments must be told apart at a glance. Anchored on the HARI blue + teal, then
// spread across the wheel. Fixed hex so slices are stable in light AND dark.
export const CATEGORICAL = ["#2563eb", "#14b8a6", "#8b5cf6", "#f59e0b", "#f43f5e", "#0ea5e9"];
export const GENDER_COLORS = { female: "#2563eb", male: "#14b8a6", other: "#8b5cf6" };

export type Series = { key: string; label: string; color?: string };
export type Row = { label: string } & Record<string, string | number>;

/** Centered placeholder shown when a chart has no data (e.g. a filter that
 * matches nobody), so a card never renders as an empty white box. */
function EmptyBox({ height, label }: { height: number; label?: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      {label ?? "—"}
    </div>
  );
}


const axisProps = {
  stroke: "var(--color-muted-foreground)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    fontSize: 12,
    color: "var(--color-popover-foreground)",
  },
  labelStyle: { color: "var(--color-popover-foreground)", fontWeight: 600 },
} as const;

/** Track which series are hidden via legend clicks. */
function useToggle() {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));
  return { hidden, toggle };
}

function ClickLegend({
  series,
  hidden,
  toggle,
}: {
  series: Series[];
  hidden: Record<string, boolean>;
  toggle: (k: string) => void;
}) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {series.map((s, i) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => toggle(s.key)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity hover:opacity-80"
            style={{ opacity: hidden[s.key] ? 0.4 : 1 }}
          >
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ background: s.color ?? PALETTE[i % PALETTE.length] }}
            />
            {s.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Vertical or horizontal bars, one or more series (grouped or stacked). */
export function CategoryBarChart({
  data,
  series,
  height = 260,
  layout = "vertical",
  stacked = false,
  emptyLabel,
}: {
  data: Row[];
  series: Series[];
  height?: number;
  layout?: "vertical" | "horizontal"; // "horizontal" = bars grow sideways
  stacked?: boolean;
  emptyLabel?: string;
}) {
  const { hidden, toggle } = useToggle();
  const horizontal = layout === "horizontal";
  // A flat all-zero series is still meaningful (shows the timeframe at 0); only a
  // genuinely empty dataset gets the placeholder.
  if (!data.length) return <EmptyBox height={height} label={emptyLabel} />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="label" width={120} {...axisProps} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} />
            </>
          )}
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              hide={hidden[s.key]}
              stackId={stacked ? "a" : undefined}
              fill={s.color ?? PALETTE[i % PALETTE.length]}
              radius={stacked ? 0 : 4}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {series.length > 1 && <ClickLegend series={series} hidden={hidden} toggle={toggle} />}
    </div>
  );
}

/** One or more trend lines over a shared x axis. */
export function MultiLineChart({
  data,
  series,
  height = 260,
  emptyLabel,
}: {
  data: Row[];
  series: Series[];
  height?: number;
  emptyLabel?: string;
}) {
  const { hidden, toggle } = useToggle();
  if (!data.length) return <EmptyBox height={height} label={emptyLabel} />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip {...tooltipStyle} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              hide={hidden[s.key]}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {series.length > 1 && <ClickLegend series={series} hidden={hidden} toggle={toggle} />}
    </div>
  );
}

/** Donut with a click-to-toggle legend. `data` rows use `label` + `value`. */
export function DistributionPie({
  data,
  height = 260,
  emptyLabel,
}: {
  data: Row[];
  height?: number;
  emptyLabel?: string;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const total = data.reduce((s, d) => s + Number(d.value ?? 0), 0);
  if (!data.length || total === 0) return <EmptyBox height={height} label={emptyLabel} />;
  const shown = data.filter((d) => !hidden[d.label]);
  const legend: Series[] = data.map((d, i) => ({ key: d.label, label: d.label, color: CATEGORICAL[i % CATEGORICAL.length] }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip {...tooltipStyle} />
          <Pie data={shown} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
            {shown.map((d) => {
              const i = data.findIndex((x) => x.label === d.label);
              return <Cell key={d.label} fill={CATEGORICAL[i % CATEGORICAL.length]} />;
            })}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <ClickLegend series={legend} hidden={hidden} toggle={(k) => setHidden((h) => ({ ...h, [k]: !h[k] }))} />
    </div>
  );
}

/** Age pyramid: female bars grow left, male bars grow right, per age band. */
export function AgePyramidChart({
  data,
  height = 300,
  femaleLabel,
  maleLabel,
}: {
  data: { band: string; female: number; male: number }[];
  height?: number;
  femaleLabel: string;
  maleLabel: string;
}) {
  // Females stored negative so they render on the left of the shared 0 axis.
  const rows = data.map((d) => ({ label: d.band, female: -d.female, male: d.male }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ left: 4, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => String(Math.abs(v))} {...axisProps} />
          <YAxis type="category" dataKey="label" width={56} {...axisProps} />
          <Tooltip {...tooltipStyle} formatter={(v) => String(Math.abs(Number(v)))} />
          <Bar dataKey="female" name={femaleLabel} fill={GENDER_COLORS.female} stackId="p" radius={[4, 0, 0, 4]} />
          <Bar dataKey="male" name={maleLabel} fill={GENDER_COLORS.male} stackId="p" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: GENDER_COLORS.female }} />
          {femaleLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: GENDER_COLORS.male }} />
          {maleLabel}
        </li>
      </ul>
    </div>
  );
}
