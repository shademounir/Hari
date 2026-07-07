// HARI-122 — small server-rendered building blocks for the analytics pages:
// a KPI stat card (value + trend delta) and a titled chart/section card with an
// optional CSV-export link. No client JS — the charts inside supply that.
import type { ComponentType, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Minus } from "lucide-react";

export function KpiCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  deltaLabel,
  invertDelta = false,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  deltaPct?: number;
  deltaLabel?: string;
  invertDelta?: boolean; // when true, a rise is "bad" (red) — e.g. absenteeism
}) {
  const up = (deltaPct ?? 0) > 0;
  const down = (deltaPct ?? 0) < 0;
  const good = invertDelta ? down : up;
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone =
    deltaPct === undefined || deltaPct === 0
      ? "text-muted-foreground"
      : good
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="card-elevated rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</p>
      {deltaLabel && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${tone}`}>
          <DeltaIcon className="size-3.5" />
          <span className="tabular-nums">
            {deltaPct !== undefined ? `${deltaPct > 0 ? "+" : ""}${deltaPct}%` : ""}
          </span>
          <span className="text-muted-foreground">{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}

export function ChartCard({
  title,
  exportHref,
  exportLabel,
  children,
  className = "",
}: {
  title: string;
  exportHref?: string;
  exportLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card-elevated rounded-2xl border bg-card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {exportHref && (
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <Download className="size-3.5" />
            {exportLabel}
          </a>
        )}
      </div>
      {children}
    </section>
  );
}
