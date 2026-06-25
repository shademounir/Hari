import Link from "next/link";
import { requireUser } from "@/lib/session";
import {
  getDirectory,
  getLeaveBalances,
  getMyLeaveRequests,
  getPendingApprovals,
  getDepartmentBreakdown,
  type LeaveRequestView,
  type DepartmentCount,
} from "@/lib/hr";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  CalendarCheck,
  Plane,
  Stethoscope,
  Bot,
  ArrowRight,
  Building2,
  ClipboardList,
  Settings,
  Sparkles,
} from "lucide-react";

// The dashboard is shaped by the signed-in role. Each role gets a coherent set
// of indicators scoped to what it is allowed to see (RBAC + the role-scoped
// data layer in lib/hr.ts): a collaborator sees only their own data, a manager
// only their team's perimeter, HR/Admin the whole company.
export default async function OverviewPage() {
  const user = await requireUser();
  const caller = { role: user.role, employeeId: user.employeeId };

  const isApprover = can(user.role, "leave:approve"); // Manager+
  const seesCompany = can(user.role, "directory:read:all"); // HR Admin+
  const isAdmin = can(user.role, "admin:settings"); // Super Admin

  const [directory, balances, myRequests, approvals, departments] =
    await Promise.all([
      getDirectory(caller),
      user.employeeId ? getLeaveBalances(user.employeeId) : Promise.resolve([]),
      user.employeeId
        ? getMyLeaveRequests(user.employeeId)
        : Promise.resolve([]),
      getPendingApprovals(caller),
      seesCompany ? getDepartmentBreakdown(caller) : Promise.resolve([]),
    ]);

  const vacation = balances.find((b) => b.type === "VACATION");
  const sick = balances.find((b) => b.type === "SICK");
  const myPending = myRequests.filter((r) => r.status === "PENDING").length;
  const directReports = directory.filter((e) => !e.isSelf).length;

  const roleLabel = ROLE_LABELS[user.role];
  const scopeNote = seesCompany
    ? "Company-wide view."
    : isApprover
      ? "Scoped to you and your direct reports."
      : "Scoped to your own data.";

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={`Signed in as ${roleLabel}. ${scopeNote}`}
      />

      <div className="space-y-6 p-4 md:p-8">
        {/* ── Indicators, adapted to the role ───────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Company tier (HR Admin, Super Admin) */}
          {seesCompany && (
            <>
              <StatCard
                icon={<Users className="size-5" />}
                label="Company headcount"
                value={String(directory.length)}
              />
              <StatCard
                icon={<Building2 className="size-5" />}
                label="Departments"
                value={String(departments.length)}
              />
              <StatCard
                icon={<CalendarCheck className="size-5" />}
                label="Pending approvals"
                value={String(approvals.length)}
                accent
              />
            </>
          )}

          {/* Manager tier (only their perimeter) */}
          {isApprover && !seesCompany && (
            <>
              <StatCard
                icon={<Users className="size-5" />}
                label="My team"
                value={String(directReports)}
              />
              <StatCard
                icon={<CalendarCheck className="size-5" />}
                label="Pending approvals"
                value={String(approvals.length)}
                accent
              />
            </>
          )}

          {/* Personal indicators — everyone with an employee profile */}
          {user.employeeId && (
            <>
              <StatCard
                icon={<Plane className="size-5" />}
                label="Vacation days left"
                value={vacation ? String(vacation.remainingDays) : "—"}
              />
              {!seesCompany && (
                <StatCard
                  icon={<Stethoscope className="size-5" />}
                  label="Sick days left"
                  value={sick ? String(sick.remainingDays) : "—"}
                />
              )}
              <StatCard
                icon={<ClipboardList className="size-5" />}
                label="My pending requests"
                value={String(myPending)}
              />
            </>
          )}
        </div>

        {/* ── Role-specific working area ─────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Approver: the approvals queue (their scope) */}
          {isApprover && (
            <SectionCard
              className="lg:col-span-2"
              icon={<CalendarCheck className="size-5 text-primary" />}
              title={
                seesCompany ? "Pending approvals — company" : "Pending approvals — my team"
              }
              action={{ href: "/time-off", label: "Open Time Off" }}
            >
              <LeaveList
                items={approvals}
                emptyLabel="No requests waiting on you. 🎉"
                showWho
              />
            </SectionCard>
          )}

          {/* HR / Admin: headcount by department */}
          {seesCompany && (
            <SectionCard
              icon={<Building2 className="size-5 text-primary" />}
              title="Headcount by department"
            >
              <DepartmentBreakdown items={departments} total={directory.length} />
            </SectionCard>
          )}

          {/* Collaborator: their own recent requests (full width when alone) */}
          {!isApprover && (
            <SectionCard
              className="lg:col-span-2"
              icon={<ClipboardList className="size-5 text-primary" />}
              title="My recent leave requests"
              action={{ href: "/time-off", label: "Open Time Off" }}
            >
              <LeaveList
                items={myRequests.slice(0, 5)}
                emptyLabel="No leave requests yet."
              />
            </SectionCard>
          )}

          {/* Manager also gets a compact personal balance recap */}
          {isApprover && !seesCompany && (
            <SectionCard
              icon={<Plane className="size-5 text-primary" />}
              title="My balances"
            >
              <BalanceList
                balances={balances.map((b) => ({
                  type: b.type,
                  remaining: b.remainingDays,
                  total: b.totalDays,
                }))}
              />
            </SectionCard>
          )}
        </div>

        {/* ── Admin-only: platform ──────────────────────────────────── */}
        {isAdmin && (
          <SectionCard
            icon={<Settings className="size-5 text-primary" />}
            title="Platform administration"
            action={{ href: "/settings", label: "Open settings" }}
          >
            <p className="text-sm text-muted-foreground">
              You have full platform access. Manage organization-wide settings,
              roles and integrations from the settings area.
            </p>
          </SectionCard>
        )}

        {/* ── AI assistant (shared) ─────────────────────────────────── */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              <CardTitle>Ask the AI Assistant</CardTitle>
              <Badge variant="secondary">RBAC-aware</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The assistant only ever acts within your permissions — it answers
              handbook questions with citations and runs HR actions through the
              same role-scoped data layer that powers this dashboard.
            </p>
            <Link href="/chat" className={buttonVariants()}>
              Open AI Assistant <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        {/* ── KPIs coming in Sprint 3 (scaffold) ────────────────────── */}
        {isApprover && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="size-4" />
              KPIs — coming in Sprint 3
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {KPI_PREVIEW.map((k) => (
                <KpiPlaceholder key={k} label={k} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

// Planned indicators for the next sprint — shown as disabled placeholders so the
// dashboard already has a home for them.
const KPI_PREVIEW = [
  "Turnover rate",
  "Absenteeism rate",
  "Avg. approval time",
  "Headcount trend",
];

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div
          className={
            accent
              ? "rounded-lg bg-primary/10 p-3 text-primary"
              : "rounded-lg bg-muted p-3 text-muted-foreground"
          }
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  icon,
  title,
  action,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: { href: string; label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {action && (
            <Link
              href={action.href}
              className="text-xs font-medium text-primary hover:underline"
            >
              {action.label}
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "APPROVED") return "default";
  if (status === "REJECTED") return "destructive";
  return "secondary"; // PENDING
}

function LeaveList({
  items,
  emptyLabel,
  showWho,
}: {
  items: LeaveRequestView[];
  emptyLabel: string;
  showWho?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {showWho ? r.employeeName : r.type}
              {showWho && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {r.type}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.startDate} → {r.endDate} · {r.days} day{r.days > 1 ? "s" : ""}
            </p>
          </div>
          <Badge variant={statusVariant(r.status)} className="shrink-0">
            {r.status.toLowerCase()}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function BalanceList({
  balances,
}: {
  balances: { type: string; remaining: number; total: number }[];
}) {
  if (balances.length === 0) {
    return <p className="text-sm text-muted-foreground">No balances.</p>;
  }
  return (
    <ul className="space-y-2">
      {balances.map((b) => (
        <li key={b.type} className="flex items-center justify-between text-sm">
          <span className="capitalize text-muted-foreground">
            {b.type.toLowerCase()}
          </span>
          <span className="font-medium">
            {b.remaining}
            <span className="text-muted-foreground"> / {b.total} days</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DepartmentBreakdown({
  items,
  total,
}: {
  items: DepartmentCount[];
  total: number;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-3">
      {items.map((d) => (
        <li key={d.department} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{d.department}</span>
            <span className="text-muted-foreground">
              {d.count}
              {total > 0 && (
                <> · {Math.round((d.count / total) * 100)}%</>
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function KpiPlaceholder({ label }: { label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-6">
        <p className="text-2xl font-semibold text-muted-foreground/50">—</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Badge variant="outline" className="mt-2 text-[10px]">
          Sprint 3
        </Badge>
      </CardContent>
    </Card>
  );
}
