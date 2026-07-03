import { getPendingApprovals, getMyLeaveRequests } from "@/lib/hr";
import { getOpenAlerts, alertDetail } from "@/lib/alerts";
import { can, type Role } from "@/lib/rbac";
import type { AlertKind, AlertSeverity } from "@prisma/client";

// Structured bell items — role-scoped, deduped, NOT localized. The client
// (components/layout/notifications.tsx) formats the title/description with the
// active locale so the API stays locale-agnostic. A discriminated union so an
// AI alert can carry its own fields without leaking into the leave items.
export type NotificationItem =
  | {
      id: string;
      kind: "approval";
      employeeName?: string;
      leaveType: "VACATION" | "SICK" | "PERSONAL";
      startDate: string;
      endDate: string;
      href: string;
    }
  | {
      id: string;
      kind: "mine";
      leaveType: "VACATION" | "SICK" | "PERSONAL";
      startDate: string;
      endDate: string;
      href: string;
    }
  | {
      id: string;
      kind: "alert";
      alertKind: AlertKind;
      severity: AlertSeverity;
      detail: string | null; // a code/count — never PII
      href: string;
    };

export async function buildNotifications(caller: {
  role: Role;
  employeeId: string | null;
}): Promise<NotificationItem[]> {
  const [approvals, myRequests, alerts] = await Promise.all([
    getPendingApprovals(caller),
    caller.employeeId ? getMyLeaveRequests(caller.employeeId) : Promise.resolve([]),
    // getOpenAlerts already returns [] for roles without `alerts:read`; guard here
    // too so we skip the query entirely for the common non-admin case.
    can(caller.role, "alerts:read")
      ? getOpenAlerts({ role: caller.role })
      : Promise.resolve([]),
  ]);

  const myPending = myRequests.filter((r) => r.status === "PENDING");
  // HR/Admin approvers see all pending requests, which can include their own —
  // don't surface those as "to approve" too (they appear under "my pending").
  const myPendingIds = new Set(myPending.map((r) => r.id));

  return [
    // AI alerts first — highest priority for the Admin/HR audience that sees them.
    ...alerts.map(
      (a): NotificationItem => ({
        id: `alert-${a.id}`,
        kind: "alert",
        alertKind: a.kind,
        severity: a.severity,
        detail: alertDetail(a),
        href: "/alerts",
      }),
    ),
    ...approvals
      .filter((a) => !myPendingIds.has(a.id))
      .map((a): NotificationItem => ({
        id: `approval-${a.id}`,
        kind: "approval",
        employeeName: a.employeeName,
        leaveType: a.type as "VACATION" | "SICK" | "PERSONAL",
        startDate: a.startDate,
        endDate: a.endDate,
        href: "/time-off",
      })),
    ...myPending.map((r): NotificationItem => ({
      id: `mine-${r.id}`,
      kind: "mine",
      leaveType: r.type as "VACATION" | "SICK" | "PERSONAL",
      startDate: r.startDate,
      endDate: r.endDate,
      href: "/time-off",
    })),
  ];
}
