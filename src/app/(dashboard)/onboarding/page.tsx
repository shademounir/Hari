import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  getMyOnboarding,
  getOnboardingOverview,
  computeProgress,
  asOnboardingStepKey,
} from "@/lib/onboarding";
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
import { OnboardingChecklist } from "./onboarding-checklist";

export default async function OnboardingPage() {
  const user = await requireUser();
  const caller = user;
  const t = await getTranslations("onboarding");

  const [myTasks, overview] = await Promise.all([
    user.employeeId ? getMyOnboarding(user.employeeId) : Promise.resolve([]),
    getOnboardingOverview(caller),
  ]);
  const myProgress = computeProgress(myTasks);
  const showOverview = can(user, "directory:read:all");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-8 p-4 md:p-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">{t("myOnboarding")}</h2>
            <span className="text-sm text-muted-foreground">
              {t("progressCount", { done: myProgress.done, total: myProgress.total })}
            </span>
          </div>
          <ProgressBar percent={myProgress.percent} />
          {myTasks.length > 0 ? (
            <OnboardingChecklist
              tasks={myTasks.map((task) => ({
                id: task.id,
                key: asOnboardingStepKey(task.key),
                category: task.category,
                status: task.status,
              }))}
            />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          )}
        </section>

        {showOverview && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("teamProgress")}</h2>
            {overview.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("overviewEmpty")}
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("employee")}</TableHead>
                      <TableHead>{t("role")}</TableHead>
                      <TableHead>{t("department")}</TableHead>
                      <TableHead className="w-[40%]">{t("progress")}</TableHead>
                      <TableHead className="text-right">{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.map((row) => (
                      <TableRow key={row.employeeId}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-muted-foreground">{row.title}</TableCell>
                        <TableCell className="text-muted-foreground">{row.department}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <ProgressBar percent={row.progress.percent} className="flex-1" />
                            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                              {row.progress.percent}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={row.progress.percent === 100 ? "default" : "secondary"}>
                            {row.progress.percent === 100
                              ? t("statusComplete")
                              : t("progressCount", {
                                  done: row.progress.done,
                                  total: row.progress.total,
                                })}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

// Decorative progress bar — the numeric percentage is always shown as text
// alongside it, so the bar itself is aria-hidden (no redundant announcement).
function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-2 overflow-hidden rounded-full bg-muted ${className ?? ""}`}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
