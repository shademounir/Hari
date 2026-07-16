import { redirect } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { FileText, Download } from "lucide-react";

import { requestWorkCertificate } from "@/app/(dashboard)/documents/actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentQueue } from "@/components/documents/document-queue";
import { can } from "@/lib/rbac";
import { actorOf, requireUser } from "@/lib/session";
import { listOwnDocuments, listDocumentQueue } from "@/lib/documents";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "documents:request")) redirect("/");

  const t = await getTranslations("documents");
  const format = await getFormatter();
  const params = await searchParams;
  const requested = params.requested === "1";
  const isHr = can(user, "documents:download:any");

  const [ownDocuments, queue] = await Promise.all([
    listOwnDocuments(user.id),
    isHr ? listDocumentQueue(actorOf(user)) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        {requested && (
          <div className="rounded-lg border bg-background p-4 text-sm">{t("requestSuccess")}</div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-lg border bg-muted p-2">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle>{t("workCertificateTitle")}</CardTitle>
                <CardDescription>{t("workCertificateDescription")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={requestWorkCertificate}>
              <Button type="submit">{t("requestWorkCertificate")}</Button>
            </form>
          </CardContent>
        </Card>

        {/* Employee's own requests — status + download when ready. */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("myDocuments")}</h2>
          {ownDocuments.length === 0 ? (
            <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("noDocuments")}
            </p>
          ) : (
            <ul className="space-y-2">
              {ownDocuments.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{t("workCertificateTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(d.requestedAt, { dateStyle: "medium" })}
                      {d.generatedAt && (
                        <>
                          {" · "}
                          {t("generatedOn", {
                            date: format.dateTime(d.generatedAt, { dateStyle: "medium" }),
                          })}
                        </>
                      )}
                      {d.status === "REJECTED" && d.rejectionNote && (
                        <span className="text-destructive"> · {d.rejectionNote}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DocumentStatusBadge status={d.status} />
                    {d.canDownload && (
                      <a
                        href={`/api/documents/${d.id}/download`}
                        className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
                      >
                        <Download className="size-4" />
                        {t("download")}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* HR fulfillment queue. */}
        {isHr && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{t("queue.title")}</h2>
            <DocumentQueue
              rows={queue.map((q) => ({
                id: q.id,
                status: q.status,
                requestedAt: q.requestedAt.toISOString(),
                generatedAt: q.generatedAt ? q.generatedAt.toISOString() : null,
                requesterName: q.requesterName,
                department: q.department,
              }))}
            />
          </section>
        )}
      </div>
    </>
  );
}
