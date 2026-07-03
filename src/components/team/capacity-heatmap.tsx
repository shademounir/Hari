import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatmapModel, RiskBand } from "@/types/dashboard";

// Dependency-free calendar heatmap (chosen over tremor/recharts — neither has a
// good native heatmap, and a CSS grid stays design-system aligned + fully
// server-rendered, so no client JS ships for ~45 cells). One column per week,
// seven rows per weekday; each cell's tone tracks the coverage-risk band. Pure
// render from lib/kpi/capacity.ts, which already scoped the leave to the team.
//
// Readability: a one-line explanation, a plain-language "busiest day" summary,
// localized month + weekday axes, per-cell hover details (native title), and a
// full four-level legend — so a non-technical manager understands it at a glance.

const BAND_CLASS: Record<RiskBand, string> = {
  none: "bg-muted",
  low: "bg-primary/25",
  medium: "bg-primary/55",
  high: "bg-destructive/70",
};

// 0 = Monday … 6 = Sunday, so weeks read as columns starting Monday.
function weekdayIndex(dateIso: string): number {
  return (new Date(`${dateIso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

const parseUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function CapacityHeatmap({ model }: { model: HeatmapModel }) {
  const t = await getTranslations("team");
  const locale = await getLocale();

  const fmtDay = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const fmtMonth = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const fmtWeekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });

  // Localized Mon/Wed/Fri labels (2024-01-01 is a Monday). Odd rows blank to declutter.
  const weekdayLabels = Array.from({ length: 7 }, (_, row) =>
    row % 2 === 0
      ? fmtWeekday.format(new Date(Date.UTC(2024, 0, 1 + row)))
      : "",
  );

  // Lay cells into columns (weeks). A new column starts on each Monday.
  const columns: (HeatmapModel["cells"][number] | null)[][] = [];
  let current: (HeatmapModel["cells"][number] | null)[] = [];
  for (const cell of model.cells) {
    const row = weekdayIndex(cell.date);
    if (row === 0 && current.length) {
      columns.push(current);
      current = [];
    }
    while (current.length < row) current.push(null); // pad leading days of week 1
    current.push(cell);
  }
  if (current.length) columns.push(current);

  // Month label above a week only when its month differs from the previous week's.
  let lastMonth = "";
  const monthLabels = columns.map((week) => {
    const first = week.find(Boolean);
    if (!first) return "";
    const m = fmtMonth.format(parseUtc(first.date));
    if (m === lastMonth) return "";
    lastMonth = m;
    return m;
  });

  // The single worst day, for the plain-language summary.
  const busiest = model.cells.reduce(
    (best, c) => (c.onLeave > best.onLeave ? c : best),
    model.cells[0],
  );
  const hasRisk = busiest && busiest.onLeave > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          {t("capacity.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("capacity.description")}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Plain-language takeaway — the insight in words, not just colour. */}
        <p className="text-sm">
          {hasRisk
            ? t("capacity.busiest", {
                date: fmtDay.format(parseUtc(busiest.date)),
                count: busiest.onLeave,
                total: model.teamSize,
                pct: Math.round(busiest.ratio * 100),
              })
            : t("capacity.allClear")}
        </p>

        <div className="flex gap-3">
          {/* Weekday axis (offset to clear the month-label row) */}
          <div className="grid grid-rows-7 gap-1 pt-6 text-[10px] leading-3.5 text-muted-foreground">
            {weekdayLabels.map((label, i) => (
              <div key={i} className="h-3.5">
                {label}
              </div>
            ))}
          </div>

          {/* Weeks — month label on top of each column, then the 7 day cells */}
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1">
              {columns.map((week, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="h-4 text-[10px] leading-4 text-muted-foreground">
                    {monthLabels[i]}
                  </div>
                  <div className="grid grid-rows-7 gap-1">
                    {Array.from({ length: 7 }, (_, row) => {
                      const cell = week[row] ?? null;
                      if (!cell)
                        return (
                          <div key={row} className="size-3.5 rounded-sm" />
                        );
                      const pct = Math.round(cell.ratio * 100);
                      return (
                        <div
                          key={row}
                          className={`size-3.5 rounded-sm ${BAND_CLASS[cell.band]}`}
                          title={`${fmtDay.format(parseUtc(cell.date))} — ${cell.onLeave}/${model.teamSize} ${t("capacity.onLeave")} (${pct}%)`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend — all four levels labelled, with a fewer→more scale. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
          <span className="font-medium text-muted-foreground">
            {t("capacity.risk")}
          </span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>{t("capacity.fewer")}</span>
            <span className="flex items-center gap-1">
              <span
                className="size-3.5 rounded-sm bg-muted"
                title={t("capacity.none")}
              />
              <span
                className="size-3.5 rounded-sm bg-primary/25"
                title={t("capacity.low")}
              />
              <span
                className="size-3.5 rounded-sm bg-primary/55"
                title={t("capacity.medium")}
              />
              <span
                className="size-3.5 rounded-sm bg-destructive/70"
                title={t("capacity.high")}
              />
            </span>
            <span className="font-medium text-destructive">
              {t("capacity.more")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
