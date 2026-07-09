import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Display bands for the UI badge use the thresholds from the ticket (green < 30,
// orange 30–60, red > 60) — deliberately independent of the model's LOW/MEDIUM/
// HIGH bands (40/70), which drive alerting. Pure + presentational: the localized
// label is passed in so this stays a Server Component with no async per badge.
export type DisplayBand = "green" | "orange" | "red";

export function displayBand(score: number): DisplayBand {
  if (score > 60) return "red";
  if (score >= 30) return "orange";
  return "green";
}

const STYLES: Record<DisplayBand, { badge: string; dot: string }> = {
  green: {
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  orange: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  red: {
    badge: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

export function RiskBandBadge({
  score,
  label,
  showScore = true,
  className,
}: {
  score: number;
  label: string;
  showScore?: boolean;
  className?: string;
}) {
  const band = displayBand(score);
  const s = STYLES[band];
  return (
    <Badge className={cn("gap-1.5 border-transparent font-semibold", s.badge, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {label}
      {showScore && <span className="tabular-nums opacity-70">· {score}</span>}
    </Badge>
  );
}
