import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import {
  listOffboardingCandidates,
  getOffboardings,
  asOffboardingStepKey,
} from "@/lib/offboarding";
import { isoDateInTimeZone } from "@/lib/datetime";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OffboardingBoard, type BoardItem } from "./offboarding-board";
import { initiateOffboardingAction } from "./actions";

const REASONS = ["RESIGNATION", "TERMINATION", "END_OF_CONTRACT", "RETIREMENT", "OTHER"] as const;

export default async function OffboardingPage() {
  const user = await requireUser();
  // Offboarding is HR-only. Gate the whole page server-side.
  if (!can(user.role, "employee:manage")) redirect("/");
  const actor = { userId: user.id, role: user.role };
  const t = await getTranslations("offboarding");

  const [candidates, inProgress, completed] = await Promise.all([
    listOffboardingCandidates(actor),
    getOffboardings(actor, "IN_PROGRESS"),
    getOffboardings(actor, "COMPLETED"),
  ]);

  const board: BoardItem[] = inProgress.map((o) => ({
    id: o.id,
    employeeName: o.employeeName,
    title: o.title,
    reason: o.reason,
    lastDay: isoDateInTimeZone(o.lastDay, "UTC"),
    steps: o.steps.map((s) => ({
      id: s.id,
      key: asOffboardingStepKey(s.key),
      category: s.category,
      status: s.status,
    })),
    done: o.progress.done,
    total: o.progress.total,
    percent: o.progress.percent,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-8 p-4 md:p-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("initiate")}</h2>
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("noCandidates")}
            </p>
          ) : (
            <form
              action={initiateOffboardingAction}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
            >
              <label className="flex-1 space-y-1 text-sm">
                <span className="text-muted-foreground">{t("employee")}</span>
                <select
                  name="employeeId"
                  required
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {candidates.map((c) => (
                    <option key={c.employeeId} value={c.employeeId}>
                      {c.name} — {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:w-48">
                <span className="text-muted-foreground">{t("reason")}</span>
                <select
                  name="reason"
                  defaultValue="RESIGNATION"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`reasons.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:w-44">
                <span className="text-muted-foreground">{t("lastDay")}</span>
                <input
                  type="date"
                  name="lastDay"
                  required
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
              <Button type="submit" size="sm">
                {t("startProcess")}
              </Button>
            </form>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            {t("inProgress")} <Badge variant="secondary">{board.length}</Badge>
          </h2>
          <OffboardingBoard items={board} />
        </section>

        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("archived")}</h2>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employee")}</TableHead>
                    <TableHead>{t("reason")}</TableHead>
                    <TableHead>{t("lastDay")}</TableHead>
                    <TableHead className="text-right">{t("archivedOn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completed.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.employeeName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t(`reasons.${o.reason}`)}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {isoDateInTimeZone(o.lastDay, "UTC")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {o.completedAt ? isoDateInTimeZone(o.completedAt, "UTC") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
