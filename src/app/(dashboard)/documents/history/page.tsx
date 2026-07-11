import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
import { getCompanyDocumentHistory } from "@/lib/documents";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

// SCRUM-083: HR's history of every document request company-wide (any
// status), distinct from the actionable pending queue at /documents/requests.
export default async function DocumentHistoryPage() {
  const user = await requireUser();
  if (!can(user.role, "documents:download:any")) redirect("/");

  const t = await getTranslations("documents.history");
  const tType = await getTranslations("documents.type");
  const tStatus = await getTranslations("documents.status");
  const history = await getCompanyDocumentHistory(user.role);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("employee")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("requestedOn")}</TableHead>
                  <TableHead>{t("generatedOn")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell>{tType(r.type as "WORK_CERTIFICATE")}</TableCell>
                    <TableCell className="tabular-nums">{r.requestedAt}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {r.generatedAt ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "REJECTED" ? "destructive" : "secondary"}>
                        {tStatus(r.status as "REQUESTED")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
