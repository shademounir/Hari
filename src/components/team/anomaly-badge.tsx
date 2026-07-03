import { getTranslations } from "next-intl/server";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AnomalyResult, AnomalyStatus } from "@/types/dashboard";

const VARIANT: Record<AnomalyStatus, "default" | "secondary" | "destructive" | "outline"> = {
  high: "destructive",
  elevated: "secondary",
  normal: "outline",
  insufficient_data: "outline",
};

/**
 * Compact status pill for a KPI's anomaly verdict. Server component: it reads the
 * localized status label and, for a real deviation, appends the signed percent
 * change with a direction arrow. `insufficient_data` renders muted, no number.
 */
export async function AnomalyBadge({ anomaly }: { anomaly: AnomalyResult }) {
  const t = await getTranslations("team");
  const { status, deltaPct } = anomaly;

  const flagged = status === "elevated" || status === "high";
  const Arrow = !flagged ? Minus : deltaPct >= 0 ? TrendingUp : TrendingDown;
  const pct = flagged ? `${deltaPct >= 0 ? "+" : ""}${Math.round(deltaPct)}%` : null;

  return (
    <Badge
      variant={VARIANT[status]}
      className={status === "insufficient_data" ? "gap-1 text-muted-foreground" : "gap-1"}
    >
      <Arrow className="size-3" />
      {t(`anomaly.${status}`)}
      {pct && <span className="tabular-nums">{pct}</span>}
    </Badge>
  );
}
