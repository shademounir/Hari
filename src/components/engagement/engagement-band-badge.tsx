import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EngagementBand } from "@/lib/engagement/engagement";

// Band → chip styling. GREEN 80–100 · YELLOW 60–79 · ORANGE 40–59 · RED 0–39.
// Pure + presentational: the localized label is passed in so it stays a Server
// Component with no async per badge.
const STYLES: Record<EngagementBand, { badge: string; dot: string }> = {
  GREEN: { badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  YELLOW: { badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  ORANGE: { badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  RED: { badge: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

export function EngagementBandBadge({
  band,
  label,
  score,
  className,
}: {
  band: EngagementBand;
  label: string;
  score?: number;
  className?: string;
}) {
  const s = STYLES[band];
  return (
    <Badge className={cn("gap-1.5 border-transparent font-semibold", s.badge, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {label}
      {typeof score === "number" && <span className="tabular-nums opacity-70">· {score}</span>}
    </Badge>
  );
}

/** Shared quadrant → color (used by the badge + the scatter chart). */
export const QUADRANT_COLORS = {
  ENGAGED: "#10b981", // emerald
  BOREOUT: "#f59e0b", // amber
  STRAINED: "#3b82f6", // blue
  BURNOUT: "#ef4444", // red
} as const;
