import { cn } from "@/lib/utils";

// Lightweight, dependency-free SVG charts in the HARI brand palette. Pure markup
// (no client hooks) so they render in Server Components.

/** Donut / ring gauge for a single 0–100 percentage. */
export function Donut({
  value,
  size = 132,
  stroke = 13,
  label,
  sublabel,
  idSuffix = "",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  idSuffix?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  const gid = `hari-donut${idSuffix}`;
  const center = size / 2;

  return (
    <div className="relative inline-grid place-items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${v}%`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-from)" />
            <stop offset="100%" stopColor="var(--brand-to)" />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-2xl font-extrabold text-foreground">{label ?? `${v}%`}</span>
        {sublabel && <span className="mt-1 text-xs text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}

/** Horizontal progress meter (used / total), brand-gradient fill. */
export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
    </div>
  );
}
