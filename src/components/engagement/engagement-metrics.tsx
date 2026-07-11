import { getTranslations } from "next-intl/server";
import { Users, HeartPulse, Flame, BatteryLow } from "lucide-react";
import type { EngagementDashboardRow } from "@/lib/engagement/data-layer";

const ACCENT = {
  primary: "bg-primary/10 text-primary",
  red: "bg-destructive/10 text-destructive",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
} as const;

/** Company/team aggregate summary cards (e.g. "15 employees in BURNOUT"). */
export async function EngagementMetrics({ rows }: { rows: EngagementDashboardRow[] }) {
  const t = await getTranslations("engagement.metrics");

  const atRisk = rows.filter((r) => r.band === "ORANGE" || r.band === "RED").length;
  const burnout = rows.filter((r) => r.quadrant === "BURNOUT").length;
  const boreout = rows.filter((r) => r.quadrant === "BOREOUT").length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card icon={Users} label={t("evaluated")} value={rows.length} hint={t("evaluatedHint")} accent="primary" />
      <Card icon={HeartPulse} label={t("atRisk")} value={atRisk} hint={t("atRiskHint")} accent="red" />
      <Card icon={Flame} label={t("burnout")} value={burnout} hint={t("burnoutHint")} accent="red" />
      <Card icon={BatteryLow} label={t("boreout")} value={boreout} hint={t("boreoutHint")} accent="amber" />
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  accent: keyof typeof ACCENT;
}) {
  return (
    <div className="card-elevated rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`rounded-lg p-2 ${ACCENT[accent]}`}>
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
