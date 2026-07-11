"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EngagementTrendPoint } from "@/lib/engagement/data-layer";

const ACCENT = "#6366f1";
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

/** Average engagement score of the current scope over the trailing weeks. */
export function EngagementTrendChart({ points }: { points: EngagementTrendPoint[] }) {
  const t = useTranslations("engagement.trend");
  const locale = useLocale();

  const data = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
    return points.map((p) => ({ label: fmt.format(new Date(p.weekStart)), avg: p.avg }));
  }, [points, locale]);

  return (
    <div className="rounded-xl border bg-card/50 p-4">
      <h3 className="mb-1 text-sm font-semibold">{t("title")}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t("description")}</p>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="engTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
            {/* Band guides */}
            <ReferenceLine y={80} stroke="#10b981" strokeDasharray="2 4" strokeOpacity={0.5} />
            <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="2 4" strokeOpacity={0.5} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="avg" stroke="none" fill="url(#engTrendFill)" />
            <Line type="monotone" dataKey="avg" name={t("avgLabel")} stroke={ACCENT} strokeWidth={2.5} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
