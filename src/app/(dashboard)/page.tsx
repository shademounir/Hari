import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getDirectory, getLeaveBalances, getPendingApprovals } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarCheck, Plane, Bot, ArrowRight } from "lucide-react";

export default async function OverviewPage() {
  const user = await requireUser();
  const caller = { role: user.role, employeeId: user.employeeId };
  const t = await getTranslations("dashboard");
  const tRoles = await getTranslations("roles");

  const [directory, balances, approvals] = await Promise.all([
    getDirectory(caller),
    user.employeeId ? getLeaveBalances(user.employeeId) : Promise.resolve([]),
    getPendingApprovals(caller),
  ]);

  const vacation = balances.find((b) => b.type === "VACATION");

  return (
    <>
      <PageHeader
        title={t("welcome", { name: user.name.split(" ")[0] })}
        description={t("signedInAs", { role: tRoles(user.role) })}
      />
      <div className="space-y-6 p-4 md:p-8">
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

        {/* The hero of the starter: the AI assistant. */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              <CardTitle>{t("assistantTitle")}</CardTitle>
              <Badge variant="secondary">{t("rbacAware")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("assistantDescription")}
            </p>
            <ul className="grid gap-2 text-sm">
              <li>· {t("example1")}</li>
              <li>· {t("example2")}</li>
              <li>· {t("example3")}</li>
            </ul>
            <Link href="/chat" className={buttonVariants()}>
              {t("openAssistant")} <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
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
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-lg bg-muted p-3 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
