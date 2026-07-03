import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getAlerts, alertDetail } from "@/lib/alerts";
import { PageHeader } from "@/components/layout/page-header";
import { AlertsTable, type AlertRow } from "@/components/alerts/alerts-table";

// AI observability alerts (SCRUM-063), for Admin/HR only. Server-gated by
// `alerts:read`; a non-privileged (or hand-crafted) request 404s.
export default async function AlertsPage() {
  const user = await requireUser();
  if (!can(user.role, "alerts:read")) notFound();

  const alerts = await getAlerts({ role: user.role });
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
  }));

  return (
    <div className="pb-10">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="px-4 pt-6 md:px-8">
        <AlertsTable rows={rows} />
      </div>
    </div>
  );
}
