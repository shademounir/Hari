"use client";

import { TrendingDown, HeartPulse } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Generative cards for the risk tools (predictDepartures / getEngagementRisk).
// These replace the raw-JSON default fallback in tool-call.tsx.
//
// RBAC-aware by construction — they render exactly what the role-scoped tool
// output carries: a MANAGER's output is anonymized (no name/id; the card shows
// department + band + factors and an "aggregate team view" note), while HR/Admin
// get names (predictDepartures) and company scope. The card never invents an
// identity the server didn't provide. Band/quadrant/factor labels reuse the
// existing dashboard i18n (predictions.*/engagement.*), so nothing new to translate.
// ─────────────────────────────────────────────────────────────────────────

type Tone = "good" | "watch" | "warn" | "bad";
const TONE_CLS: Record<Tone, string> = {
  good: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  warn: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

function BandPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", TONE_CLS[tone])}>
      {children}
    </span>
  );
}

// Translate factor keys via an existing namespace; fall back to the raw key if a
// label is ever missing (keeps a new/unknown factor from crashing the card).
function FactorChips({ keys, namespace }: { keys?: string[]; namespace: "predictions.factor" | "engagement.factor" }) {
  const t = useTranslations(namespace);
  if (!keys?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t.has(k as never) ? t(k as never) : k}
        </span>
      ))}
    </div>
  );
}

function Empty() {
  const t = useTranslations("riskCard");
  return (
    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("empty")}</p>
  );
}

function CardShell({
  icon: Icon,
  title,
  scope,
  summary,
  note,
  children,
}: {
  icon: typeof TrendingDown;
  title: string;
  scope: string;
  summary: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{title}</span>
          <Badge variant="secondary" className="text-[10px]">{scope}</Badge>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{summary}</span>
        </div>
        {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

// ── Departure risk (predictDepartures) ──────────────────────────────────────
const DEPARTURE_BAND: Record<string, { key: string; tone: Tone }> = {
  LOW: { key: "green", tone: "good" },
  MEDIUM: { key: "orange", tone: "watch" },
  HIGH: { key: "red", tone: "bad" },
};

type DepartureEntry = {
  rank: number;
  department: string;
  score: number;
  band: string;
  topFactors?: string[];
  employeeId?: string; // present only for HR/Admin (named view)
  name?: string;
  title?: string;
};
type DepartureData = {
  scope: "team" | "company";
  anonymized: boolean;
  totalEvaluated: number;
  highRiskCount: number;
  atRisk: DepartureEntry[];
};

export function DepartureRiskCard({ data }: { data: DepartureData }) {
  const t = useTranslations("riskCard");
  const tBand = useTranslations("predictions.band");
  if (!data?.atRisk?.length) return <Empty />;
  const scope = data.scope === "company" ? t("scopeCompany") : t("scopeTeam");
  return (
    <CardShell
      icon={TrendingDown}
      title={t("departureTitle")}
      scope={scope}
      summary={t("highRisk", { count: data.highRiskCount, total: data.totalEvaluated })}
      note={data.anonymized ? t("anonymized") : undefined}
    >
      {data.atRisk.map((r, i) => {
        const b = DEPARTURE_BAND[r.band] ?? { key: null, tone: "watch" as Tone };
        return (
          <li key={r.employeeId ?? i} className="flex items-start gap-2 rounded-md border bg-background/50 p-2">
            <span className="mt-0.5 text-xs font-semibold text-muted-foreground">#{r.rank}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Named for HR/Admin; department-only when anonymized (manager). */}
                <span className="truncate font-medium">{r.name ?? r.department}</span>
                {r.name && r.title && (
                  <span className="truncate text-xs text-muted-foreground">{r.title}</span>
                )}
                <BandPill tone={b.tone}>{b.key && tBand.has(b.key as never) ? tBand(b.key as never) : r.band}</BandPill>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{r.score}</span>
              </div>
              {r.name && <p className="truncate text-xs text-muted-foreground">{r.department}</p>}
              <FactorChips keys={r.topFactors} namespace="predictions.factor" />
            </div>
          </li>
        );
      })}
    </CardShell>
  );
}

// ── Engagement / burnout risk (getEngagementRisk) ───────────────────────────
const ENGAGEMENT_TONE: Record<string, Tone> = {
  GREEN: "good",
  YELLOW: "watch",
  ORANGE: "warn",
  RED: "bad",
};

type EngagementEntry = {
  employeeId?: string; // present only for HR/Admin
  department: string;
  score: number;
  band: string;
  quadrant: string;
  exhaustion?: number;
  disengagement?: number;
  topFactors?: string[];
};
type EngagementData = {
  scope: "team" | "company";
  totalEvaluated: number;
  atRiskCount: number;
  results: EngagementEntry[];
};

export function EngagementRiskCard({ data }: { data: EngagementData }) {
  const t = useTranslations("riskCard");
  const tBand = useTranslations("engagement.band");
  const tQuad = useTranslations("engagement.quadrant");
  if (!data?.results?.length) return <Empty />;
  const scope = data.scope === "company" ? t("scopeCompany") : t("scopeTeam");
  // Engagement never carries a name (privacy). A manager (team scope) sees an
  // aggregate view; HR sees the company. Neither card names individuals.
  const anonymized = data.scope !== "company";
  return (
    <CardShell
      icon={HeartPulse}
      title={t("engagementTitle")}
      scope={scope}
      summary={t("atRisk", { count: data.atRiskCount, total: data.totalEvaluated })}
      note={anonymized ? t("anonymized") : undefined}
    >
      {data.results.map((r, i) => (
        <li key={r.employeeId ?? i} className="flex items-start gap-2 rounded-md border bg-background/50 p-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium">{r.department}</span>
              <Badge variant="outline" className="text-[10px]">
                {tQuad.has(r.quadrant as never) ? tQuad(r.quadrant as never) : r.quadrant}
              </Badge>
              <BandPill tone={ENGAGEMENT_TONE[r.band] ?? "watch"}>
                {tBand.has(r.band as never) ? tBand(r.band as never) : r.band}
              </BandPill>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{r.score}</span>
            </div>
            <FactorChips keys={r.topFactors} namespace="engagement.factor" />
          </div>
        </li>
      ))}
    </CardShell>
  );
}
