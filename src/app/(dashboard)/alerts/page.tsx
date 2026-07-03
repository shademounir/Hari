import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { AlertStatus } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getAlerts, getAlertStatusCounts, alertDetail } from "@/lib/alerts";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { AlertsTable, type AlertRow } from "@/components/alerts/alerts-table";

const STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
const isStatus = (v: string | undefined): v is AlertStatus =>
  !!v && (STATUSES as readonly string[]).includes(v);

// AI observability alerts (SCRUM-063), for Admin/HR only. Server-gated by
// `alerts:read`; a non-privileged (or hand-crafted) request 404s.
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "alerts:read")) notFound();

  const { status: raw } = await searchParams;
  const status = isStatus(raw) ? raw : undefined; // undefined = "all"

  const [alerts, counts] = await Promise.all([
    getAlerts({ role: user.role }, status ? { status } : undefined),
    getAlertStatusCounts({ role: user.role }),
  ]);
  const t = await getTranslations("alerts");

  // Serialize for the client table (Dates → ISO; detail precomputed once).
  const rows: AlertRow[] = alerts.map((a) => ({
    id: a.id,
    kind: a.kind,
    severity: a.severity,
    status: a.status,
    detail: alertDetail(a),
    subjectName: a.subjectName,
    createdAt: a.createdAt.toISOString(),
    acknowledgedByName: a.acknowledgedByName,
    resolvedByName: a.resolvedByName,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
  }));

  // Server-rendered status filter — plain links, no client state. Each tab shows
  // its count so the workload is visible before you click.
  const tabs: { key: "all" | AlertStatus; href: string; count: number }[] = [
    { key: "all", href: "/alerts", count: counts.all },
    ...STATUSES.map((s) => ({ key: s, href: `/alerts?status=${s}`, count: counts[s] })),
  ];
  const active = status ?? "all";

  return (
    <div className="pb-10">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-4 px-4 pt-6 md:px-8">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("colStatus")}>
          {tabs.map((tab) => (
            <ButtonLink
              key={tab.key}
              href={tab.href}
              size="sm"
              variant={active === tab.key ? "secondary" : "ghost"}
              aria-current={active === tab.key ? "page" : undefined}
            >
              {t(`filter.${tab.key}`)}
              <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
            </ButtonLink>
          ))}
        </div>
        <AlertsTable rows={rows} />
      </div>
    </div>
  );
}
