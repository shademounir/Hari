import type { ComponentType } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, CalendarClock, Bot, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/session";
import {
  getEmployeeDirectoryFacets,
  getPendingApprovals,
  getTeamLeaveRequests,
  getTeamScope,
} from "@/lib/hr";
import { getTeamDashboard } from "@/lib/kpi/dashboard";
import { can } from "@/lib/rbac";
import type { KpiKey } from "@/types/dashboard";
import { PageHeader } from "@/components/layout/page-header";
import { Sparkline } from "@/components/charts/mini";
import { PendingApprovals } from "@/components/team/pending-approvals";
import { TeamFilters } from "@/components/team/team-filters";
import { LeaveHistory } from "@/components/team/leave-history";
import { AnomalyBadge } from "@/components/team/anomaly-badge";
import { CapacityHeatmap } from "@/components/team/capacity-heatmap";

// Normalize a repeatable query param into a string[] (RSC-native searchParams).
const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const KPI_ICON: Record<KpiKey, ComponentType<{ className?: string }>> = {
  headcount: Users,
  pendingRequests: CalendarClock,
  aiTurns7d: Bot,
  aiRefusals7d: ShieldAlert,
};

// Server Component: all data is fetched + scoped server-side. The only value that
// crosses to the client is each row's opaque request id (for the action buttons);
// no salary, no role, no cross-team data ever reaches the browser.
type Props = {
  searchParams: Promise<{
    search?: string;
    status?: string | string[];
    type?: string | string[];
    dept?: string | string[];
  }>;
};

export default async function TeamPage({ searchParams }: Props) {
  const user = await requireUser();

  // Server-side gate — defense in depth beyond the nav filter (which only hides
  // the link) and the data-layer check inside getTeamKpis.
  if (!can(user, "dashboard:read:team")) redirect("/");

  const caller = user;
  const params = await searchParams;
  const t = await getTranslations("team");

  // Resolve the team scope ONCE and thread it into every service, so a single
  // page render runs the directoryWhere query once instead of three times.
  const scope = await getTeamScope(caller);

  // `now` is resolved once, server-side, so the whole model shares one clock.
  // Leave filters come from the URL but are validated in getTeamLeaveRequests and
  // always applied WITHIN the team scope — a crafted query can't widen the team.
  const now = new Date();
  const [dashboard, approvals, leaveHistory, facets] = await Promise.all([
    getTeamDashboard(caller, now, scope),
    getPendingApprovals(caller),
    getTeamLeaveRequests(
      caller,
      {
        search: typeof params.search === "string" ? params.search : undefined,
        status: asArray(params.status),
        type: asArray(params.type),
        departments: asArray(params.dept),
      },
      scope,
    ),
    // Department options for the facet — already team-scoped (directoryWhere).
    getEmployeeDirectoryFacets(caller),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        {/* KPI grid — value + trend sparkline + anomaly verdict */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.kpis.map((card) => {
            const Icon = KPI_ICON[card.key];
            return (
              <div key={card.key} className="card-elevated rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">{t(`kpi.${card.key}`)}</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="size-5" />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                  {card.value}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <AnomalyBadge anomaly={card.anomaly} />
                  {card.series.length > 0 && (
                    <Sparkline values={card.series.map((p) => p.value)} width={88} height={28} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Capacity heatmap — team leave-overlap risk over the coming weeks */}
        <CapacityHeatmap model={dashboard.capacity} />

        {/* Pending approvals — client island owns selection, dialog, optimistic list */}
        <PendingApprovals
          rows={approvals.map((r) => ({
            id: r.id,
            employeeName: r.employeeName,
            type: r.type,
            startDate: r.startDate,
            endDate: r.endDate,
            days: r.days,
            reason: r.reason,
          }))}
        />

        {/* Leave history — URL-filterable (search / status / type / dept), team-scoped */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("leaveHistory")}</h2>
          <TeamFilters departments={facets.departments} />
          <LeaveHistory rows={leaveHistory} />
        </section>
      </div>
    </>
  );
}
