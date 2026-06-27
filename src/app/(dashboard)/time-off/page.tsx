import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import {
  getLeaveBalances,
  getMyLeaveRequests,
  getPendingApprovals,
} from "@/lib/hr";
import { can } from "@/lib/rbac";
import { asLeaveType, asLeaveStatus } from "@/lib/leave";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
};

export default async function TimeOffPage() {
  const user = await requireUser();
  const caller = { role: user.role, employeeId: user.employeeId };
  const t = await getTranslations("timeOff");
  const tType = await getTranslations("leaveType");

  const [balances, requests, approvals] = await Promise.all([
    user.employeeId ? getLeaveBalances(user.employeeId) : Promise.resolve([]),
    user.employeeId ? getMyLeaveRequests(user.employeeId) : Promise.resolve([]),
    getPendingApprovals(caller),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {balances.map((b) => (
            <Card key={b.type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize text-muted-foreground">
                  {tType(asLeaveType(b.type))}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {b.remainingDays}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    {t("outOf", { count: b.totalDays })}
                  </span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("myRequests")}</h2>
          <LeaveTable rows={requests} showWho={false} />
        </section>

        {can(user.role, "leave:approve") && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              {t("pendingApprovals")}{" "}
              <Badge variant="secondary">{approvals.length}</Badge>
            </h2>
            <LeaveTable rows={approvals} showWho />
          </section>
        )}
      </div>
    </>
  );
}

async function LeaveTable({
  rows,
  showWho,
}: {
  rows: {
    id: string;
    employeeName: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    reason: string | null;
  }[];
  showWho: boolean;
}) {
  const t = await getTranslations("timeOff");
  const tType = await getTranslations("leaveType");
  const tStatus = await getTranslations("leaveStatus");
  const tc = await getTranslations("common");
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {showWho && <TableHead>{t("employee")}</TableHead>}
            <TableHead>{t("type")}</TableHead>
            <TableHead>{t("dates")}</TableHead>
            <TableHead>{t("days")}</TableHead>
            <TableHead>{t("reason")}</TableHead>
            <TableHead className="text-right">{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              {showWho && <TableCell className="font-medium">{r.employeeName}</TableCell>}
              <TableCell className="capitalize">{tType(asLeaveType(r.type))}</TableCell>
              <TableCell className="tabular-nums">
                {r.startDate} → {r.endDate}
              </TableCell>
              <TableCell>{r.days}</TableCell>
              <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                {r.reason ?? tc("none")}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                  {tStatus(asLeaveStatus(r.status))}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
