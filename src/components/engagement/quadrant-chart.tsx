"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { EngagementQuadrant } from "@/lib/engagement/engagement";
import { QUADRANT_COLORS } from "./engagement-band-badge";

// Privacy-safe point (this chart renders on RBAC-gated pages, so the name is
// allowed — the AI-tool path never receives it).
export type QuadrantPoint = {
  name: string;
  department: string;
  exhaustion: number; // Y
  disengagement: number; // X
  score: number;
  quadrant: EngagementQuadrant;
};

const MID = 50;

// Faint quadrant backgrounds: [x1,x2,y1,y2] in axis units.
const AREAS: { q: EngagementQuadrant; x1: number; x2: number; y1: number; y2: number }[] = [
  { q: "BURNOUT", x1: MID, x2: 100, y1: MID, y2: 100 }, // top-right
  { q: "STRAINED", x1: 0, x2: MID, y1: MID, y2: 100 }, // top-left
  { q: "BOREOUT", x1: MID, x2: 100, y1: 0, y2: MID }, // bottom-right
  { q: "ENGAGED", x1: 0, x2: MID, y1: 0, y2: MID }, // bottom-left
];

export function QuadrantChart({ points }: { points: QuadrantPoint[] }) {
  const t = useTranslations("engagement.quadrant");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card/50 p-4">
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
            {AREAS.map((a) => (
              <ReferenceArea
                key={a.q}
                x1={a.x1}
                x2={a.x2}
                y1={a.y1}
                y2={a.y2}
                fill={QUADRANT_COLORS[a.q]}
                fillOpacity={0.06}
                stroke="none"
              />
            ))}
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <ReferenceLine x={MID} stroke="var(--border)" />
            <ReferenceLine y={MID} stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="x"
              name={t("disengagement")}
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              label={{ value: t("disengagement"), position: "bottom", offset: 8, fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={t("exhaustion")}
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              label={{ value: t("exhaustion"), angle: -90, position: "insideLeft", fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <ZAxis range={[80, 80]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as QuadrantPoint;
                return (
                  <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <p className="text-muted-foreground">{p.department}</p>
                    <p className="mt-1" style={{ color: QUADRANT_COLORS[p.quadrant] }}>
                      {t(p.quadrant)} · {p.score}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={points.map((p) => ({ ...p, x: p.disengagement, y: p.exhaustion }))}>
              {points.map((p, i) => (
                <Cell key={i} fill={QUADRANT_COLORS[p.quadrant]} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrant legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {(Object.keys(QUADRANT_COLORS) as EngagementQuadrant[]).map((q) => (
          <span key={q} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: QUADRANT_COLORS[q] }} />
            {t(q)}
          </span>
        ))}
      </div>
    </div>
  );
}
