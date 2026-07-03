import { getTranslations } from "next-intl/server";
import { asLeaveStatus, asLeaveType } from "@/lib/leave";
import type { LeaveRequestView } from "@/lib/hr";
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

/**
 * Read-only, filtered record of the team's leave requests. Rows are already
 * team-scoped + filtered server-side by getTeamLeaveRequests; this component only
 * renders. Kept a server component so no leave data ships as client JS.
 */
export async function LeaveHistory({ rows }: { rows: LeaveRequestView[] }) {
  const t = await getTranslations("team");
  const tType = await getTranslations("leaveType");
  const tStatus = await getTranslations("leaveStatus");
  const tc = await getTranslations("common");

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("noMatching")}
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("employee")}</TableHead>
            <TableHead>{t("type")}</TableHead>
            <TableHead>{t("dates")}</TableHead>
            <TableHead>{t("days")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("reason")}</TableHead>
            <TableHead>{tc("decisionNote")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.employeeName}</TableCell>
              <TableCell className="capitalize">{tType(asLeaveType(r.type))}</TableCell>
              <TableCell className="tabular-nums">
                {r.startDate} → {r.endDate}
              </TableCell>
              <TableCell className="tabular-nums">{r.days}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                  {tStatus(asLeaveStatus(r.status))}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                {r.reason ?? tc("none")}
              </TableCell>
              <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                {r.decisionNote ?? tc("none")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
