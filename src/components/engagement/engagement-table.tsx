import { getTranslations } from "next-intl/server";
import { TrendingUp, TrendingDown, Minus, ShieldCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sparkline } from "@/components/charts/mini";
import type { EngagementDashboardRow } from "@/lib/engagement/data-layer";
import { EngagementBandBadge, QUADRANT_COLORS } from "./engagement-band-badge";
import { EngagementDetailSheet } from "./engagement-detail-sheet";
import { QualitativeForm } from "./qualitative-form";

// Server Component. Momentum sparkline is pure SVG; the XAI detail Sheet + the
// qualitative form are the only client islands (per row).
export async function EngagementTable({
  rows,
  canInput,
}: {
  rows: EngagementDashboardRow[];
  canInput: boolean;
}) {
  const t = await getTranslations("engagement.table");
  const tBand = await getTranslations("engagement.band");
  const tQuad = await getTranslations("engagement.quadrant");

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
        <ShieldCheck className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">{t("employee")}</TableHead>
            <TableHead>{t("department")}</TableHead>
            <TableHead>{t("quadrant")}</TableHead>
            <TableHead className="text-center">{t("momentum")}</TableHead>
            <TableHead className="text-center">{t("score")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.employeeId}>
              <TableCell>
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.title}</div>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.department}</TableCell>
              <TableCell>
                <span className="text-sm font-medium" style={{ color: QUADRANT_COLORS[r.quadrant] }}>
                  {tQuad(r.quadrant)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-2">
                  <Sparkline values={r.history} width={72} height={24} />
                  <MomentumTag momentum={r.momentum} />
                </div>
              </TableCell>
              <TableCell className="text-center">
                <EngagementBandBadge band={r.band} label={tBand(r.band)} score={r.score} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <EngagementDetailSheet
                    row={{
                      name: r.name,
                      department: r.department,
                      score: r.score,
                      band: r.band,
                      quadrant: r.quadrant,
                      exhaustion: r.exhaustion,
                      disengagement: r.disengagement,
                      factors: r.factors,
                    }}
                  />
                  {canInput && <QualitativeForm employeeId={r.employeeId} name={r.name} />}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Momentum (points/week): ↑ improving = good, ↓ declining = bad (early warning). */
function MomentumTag({ momentum }: { momentum: number | null }) {
  if (momentum === null || Math.abs(momentum) < 0.5) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" />
      </span>
    );
  }
  const improving = momentum > 0;
  return (
    <span
      className={cnMomentum(improving)}
      title={`${momentum > 0 ? "+" : ""}${momentum} / wk`}
    >
      {improving ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      <span className="tabular-nums">{Math.abs(momentum)}</span>
    </span>
  );
}

function cnMomentum(improving: boolean): string {
  return `flex items-center gap-0.5 text-xs font-medium ${
    improving ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
  }`;
}
