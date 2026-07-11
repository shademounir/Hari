"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EngagementQuadrant } from "@/lib/engagement/engagement";
import { QUADRANT_COLORS } from "./engagement-band-badge";

// One row per department, with a count in each quadrant (stacked).
export type DistributionRow = {
  department: string;
  ENGAGED: number;
  BOREOUT: number;
  STRAINED: number;
  BURNOUT: number;
};

const ORDER: EngagementQuadrant[] = ["ENGAGED", "STRAINED", "BOREOUT", "BURNOUT"];
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

/** Quadrant breakdown per department (stacked bar). */
export function EngagementDistributionChart({ data }: { data: DistributionRow[] }) {
  const t = useTranslations("engagement.distribution");
  const tQuad = useTranslations("engagement.quadrant");

  return (
    <div className="rounded-xl border bg-card/50 p-4">
      <h3 className="mb-1 text-sm font-semibold">{t("title")}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t("description")}</p>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="department" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {ORDER.map((q, i) => (
              <Bar
                key={q}
                dataKey={q}
                stackId="q"
                name={tQuad(q)}
                fill={QUADRANT_COLORS[q]}
                radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
