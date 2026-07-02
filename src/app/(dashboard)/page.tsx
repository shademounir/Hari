import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getEmployeeDirectory, getLeaveBalances, getPendingApprovals } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Donut, ProgressBar } from "@/components/charts/mini";
import { Users, CalendarCheck, Plane, Bot, ArrowRight } from "lucide-react";

export default async function OverviewPage() {
  const user = await requireUser();
  const caller = { role: user.role, employeeId: user.employeeId };
  const t = await getTranslations("dashboard");
  const tRoles = await getTranslations("roles");
  const tLeave = await getTranslations("leaveType");

  const [directory, balances, approvals] = await Promise.all([
    getEmployeeDirectory(caller),
    user.employeeId ? getLeaveBalances(user.employeeId) : Promise.resolve([]),
    getPendingApprovals(caller),
  ]);

  const vacation = balances.find((b) => b.type === "VACATION");
  const vacationUsedPct =
    vacation && vacation.totalDays > 0
      ? Math.round((vacation.usedDays / vacation.totalDays) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title={t("welcome", { name: user.name.split(" ")[0] })}
        description={t("signedInAs", { role: tRoles(user.role) })}
      />
      <div className="space-y-6 p-4 md:p-8">
        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<Users className="size-5" />}
            label={can(user.role, "directory:read:all") ? t("peopleInCompany") : t("peopleYouCanSee")}
            value={String(directory.length)}
          />
          <StatCard
            icon={<Plane className="size-5" />}
            label={t("vacationDaysLeft")}
            value={vacation ? `${vacation.remainingDays}` : "—"}
          />
          {can(user.role, "leave:approve") && (
            <StatCard
              icon={<CalendarCheck className="size-5" />}
              label={t("pendingApprovals")}
              value={String(approvals.length)}
            />
          )}
        </div>

        {/* Charts: leave balances + vacation donut */}
        {balances.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("leaveBalances")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {balances.map((b) => (
                  <div key={b.type} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{tLeave(b.type as "VACATION" | "SICK" | "PERSONAL")}</span>
                      <span className="text-muted-foreground">
                        {t("daysUsedOfTotal", { used: b.usedDays, total: b.totalDays })}
                      </span>
                    </div>
                    <ProgressBar value={b.usedDays} max={b.totalDays} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {vacation && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("vacationUsed")}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center pb-6">
                  <Donut
                    value={vacationUsedPct}
                    sublabel={t("remainingShort", { n: vacation.remainingDays })}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* AI assistant — the HARI signature, as a brand-gradient banner. */}
        <div className="overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-sm md:p-8">
          <div className="flex items-center gap-2">
            <Bot className="size-5" />
            <h2 className="text-lg font-bold">{t("assistantTitle")}</h2>
            <Badge className="border-white/30 bg-white/15 text-white">{t("rbacAware")}</Badge>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-white/85">{t("assistantDescription")}</p>
          <ul className="mt-4 grid gap-1.5 text-sm text-white/90">
            <li>· {t("example1")}</li>
            <li>· {t("example2")}</li>
            <li>· {t("example3")}</li>
          </ul>
          <Link
            href="/chat"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-ink shadow-sm transition-colors hover:bg-white/90"
          >
            {t("openAssistant")} <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card-elevated rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
