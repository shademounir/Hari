import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RiskMapRow } from "@/lib/predictive/dashboard";
import { RiskBandBadge, displayBand } from "./risk-band-badge";
import { FactorsDialog } from "./factors-dialog";

// Server Component: renders the risk board table. Each row's explicability opens
// a client FactorsDialog — and we strip `rawValue` from every factor before it
// crosses to the client, so no sensitive input (salary growth, absence days, …)
// is ever serialized into the page.
export async function RiskMap({ rows }: { rows: RiskMapRow[] }) {
  const t = await getTranslations("predictions.riskMap");
  const tBand = await getTranslations("predictions.band");
  const tFactor = await getTranslations("predictions.factor");

  const bandLabel = (score: number) => tBand(displayBand(score));

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
            <TableHead className="min-w-48">{t("col.employee")}</TableHead>
            <TableHead>{t("col.department")}</TableHead>
            <TableHead className="text-center">{t("col.risk")}</TableHead>
            <TableHead className="text-right">{t("col.factors")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            // Strip rawValue at the server boundary — the client only sees labels
            // and each factor's contribution/intensity, never the raw signal.
            const factors = r.factors.map((f) => ({
              key: f.key,
              label: tFactor(f.key),
              points: f.points,
              normalized: f.normalized,
            }));
            return (
              <TableRow key={r.employeeId}>
                <TableCell>
                  <div className="font-medium text-foreground">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.title}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.department}
                </TableCell>
                <TableCell className="text-center">
                  <RiskBandBadge score={r.score} label={bandLabel(r.score)} />
                </TableCell>
                <TableCell className="text-right">
                  <FactorsDialog
                    employeeName={r.name}
                    score={r.score}
                    bandLabel={bandLabel(r.score)}
                    factors={factors}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
