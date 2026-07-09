"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Sparkles, Loader2, Clock, MessageCircle, HandHeart, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { EngagementBand, EngagementFactor, EngagementQuadrant } from "@/lib/engagement/engagement";
import { EngagementBandBadge, QUADRANT_COLORS } from "./engagement-band-badge";
import {
  generateSupportAgendaAction,
  type SupportAgenda,
} from "@/app/(dashboard)/team/engagement/actions";

export type EngagementDetail = {
  name: string;
  department: string;
  score: number;
  band: EngagementBand;
  quadrant: EngagementQuadrant;
  exhaustion: number;
  disengagement: number;
  factors: EngagementFactor[];
};

export function EngagementDetailSheet({ row }: { row: EngagementDetail }) {
  const t = useTranslations("engagement.detail");
  const tBand = useTranslations("engagement.band");
  const tQuad = useTranslations("engagement.quadrant");
  const tFactor = useTranslations("engagement.factor");

  const [agenda, setAgenda] = useState<SupportAgenda | null>(null);
  const [pending, startTransition] = useTransition();

  const baseline = row.factors.find((f) => f.key === "baseline");
  const deltas = row.factors.filter((f) => f.key !== "baseline");
  const maxAbs = Math.max(1, ...deltas.map((f) => Math.abs(f.points)));
  const topFactors = deltas
    .filter((f) => f.points < 0)
    .sort((a, b) => a.points - b.points)
    .slice(0, 4)
    .map((f) => f.key);

  function generate() {
    if (pending) return;
    startTransition(async () => {
      const res = await generateSupportAgendaAction({ quadrant: row.quadrant, band: row.band, topFactors });
      if (res.ok) setAgenda(res.agenda);
      else toast.error(t("agendaErrorTitle"), { description: t(`agendaError.${res.error}`) });
    });
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="sm" className="text-xs" />}>
        <Info className="size-3.5" />
        {t("view")}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>{t("title", { name: row.name })}</SheetTitle>
            <EngagementBandBadge band={row.band} label={tBand(row.band)} score={row.score} />
          </div>
          <SheetDescription>
            {row.department} ·{" "}
            <span style={{ color: QUADRANT_COLORS[row.quadrant] }}>{tQuad(row.quadrant)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* 2-D readout */}
          <div className="grid grid-cols-2 gap-3">
            <AxisBar label={t("exhaustion")} value={row.exhaustion} color="#ef4444" />
            <AxisBar label={t("disengagement")} value={row.disengagement} color="#3b82f6" />
          </div>

          {/* XAI additive waterfall */}
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("whySection")}
            </h4>
            {baseline && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{tFactor("baseline")}</span>
                <span className="font-semibold tabular-nums">{baseline.points}</span>
              </div>
            )}
            <ul className="space-y-2">
              {deltas.map((f) => (
                <li key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">{tFactor(f.key)}</span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-semibold",
                        f.points < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {f.points > 0 ? "+" : ""}
                      {f.points}
                    </span>
                  </div>
                  {/* diverging bar: negative left (red), positive right (emerald) */}
                  <div className="relative h-1.5 w-full rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    <div
                      className={cn(
                        "absolute inset-y-0 rounded-full",
                        f.points < 0 ? "bg-destructive" : "bg-emerald-500",
                      )}
                      style={
                        f.points < 0
                          ? { right: "50%", width: `${(Math.abs(f.points) / maxAbs) * 50}%` }
                          : { left: "50%", width: `${(f.points / maxAbs) * 50}%` }
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Generative supportive 1:1 agenda */}
          <section className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{t("agendaTitle")}</h4>
              <Button size="sm" className="gap-1.5" onClick={generate} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {agenda ? t("agendaRegenerate") : t("agendaGenerate")}
              </Button>
            </div>

            {agenda ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="rounded-lg bg-muted/40 p-3 italic text-foreground">“{agenda.openingTone}”</p>

                <AgendaBlock icon={MessageCircle} title={t("agendaTopics")}>
                  <ul className="space-y-1.5">
                    {agenda.discussionTopics.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium text-foreground">{d.topic}</span>
                        <span className="text-muted-foreground"> — {d.why}</span>
                      </li>
                    ))}
                  </ul>
                </AgendaBlock>

                <AgendaBlock icon={MessageCircle} title={t("agendaQuestions")}>
                  <BulletList items={agenda.suggestedQuestions} />
                </AgendaBlock>

                <AgendaBlock icon={HandHeart} title={t("agendaActions")}>
                  <BulletList items={agenda.supportiveActions} />
                </AgendaBlock>

                {/* The anti-weaponization guardrail — visually distinct */}
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                    <Ban className="size-3.5" />
                    {t("agendaAvoid")}
                  </p>
                  <BulletList items={agenda.whatNotToSay} tone="destructive" />
                </div>

                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {t("agendaFollowUp", { days: agenda.followUpInDays })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t("agendaHint")}</p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AxisBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-semibold text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function AgendaBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </p>
      {children}
    </div>
  );
}

function BulletList({ items, tone }: { items: string[]; tone?: "destructive" }) {
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span
            className={cn(
              "mt-1.5 size-1 shrink-0 rounded-full",
              tone === "destructive" ? "bg-destructive" : "bg-muted-foreground/50",
            )}
          />
          <span className={tone === "destructive" ? "text-destructive" : "text-foreground"}>{it}</span>
        </li>
      ))}
    </ul>
  );
}
