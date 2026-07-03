import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, CalendarClock, Bot, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getTeamKpis, getPendingApprovals } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { asLeaveType } from "@/lib/leave";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApprovalActions } from "@/components/team/approval-actions";

// Server Component: all data is fetched + scoped server-side. The only value that
// crosses to the client is each row's opaque request id (for the action buttons);
// no salary, no role, no cross-team data ever reaches the browser.
export default async function TeamPage() {
  const user = await requireUser();

  // Server-side gate — defense in depth beyond the nav filter (which only hides
  // the link) and the data-layer check inside getTeamKpis.
  if (!can(user.role, "dashboard:read:team")) redirect("/");

  const caller = { role: user.role, employeeId: user.employeeId };
  const t = await getTranslations("team");
  const tType = await getTranslations("leaveType");
  const tc = await getTranslations("common");

  const [kpis, approvals] = await Promise.all([
    getTeamKpis(caller),
    getPendingApprovals(caller),
  ]);

  const cards = [
    { key: "headcount", value: kpis.headcount, icon: Users },
    { key: "pendingRequests", value: kpis.pendingRequests, icon: CalendarClock },
    { key: "aiTurns7d", value: kpis.aiTurns7d, icon: Bot },
    { key: "aiRefusals7d", value: kpis.aiRefusals7d, icon: ShieldAlert },
  ] as const;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ key, value, icon: Icon }) => (
            <div key={key} className="card-elevated rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">{t(`kpi.${key}`)}</p>
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Icon className="size-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                {value}
              </p>
              {(key === "aiTurns7d" || key === "aiRefusals7d") && (
                <p className="mt-1 text-xs text-muted-foreground">{t("last7Days")}</p>
              )}
            </div>
          ))}
        </div>

        {/* Pending approvals */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {t("pendingApprovals")}
            <Badge variant="secondary">{approvals.length}</Badge>
          </h2>

          {approvals.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("noPending")}
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employee")}</TableHead>
                    <TableHead>{t("type")}</TableHead>
                    <TableHead>{t("dates")}</TableHead>
                    <TableHead>{t("days")}</TableHead>
                    <TableHead>{t("reason")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell className="capitalize">{tType(asLeaveType(r.type))}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.startDate} → {r.endDate}
                      </TableCell>
                      <TableCell className="tabular-nums">{r.days}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                        {r.reason ?? tc("none")}
                      </TableCell>
                      <TableCell>
                        <ApprovalActions requestId={r.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
