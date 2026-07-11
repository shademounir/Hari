import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";

import { requestWorkCertificate } from "@/app/(dashboard)/documents/actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getMyDocumentRequests } from "@/lib/documents";

// GENERATED/DOWNLOADED are the only statuses with a pdfUrl ready to fetch.
const DOWNLOADABLE = new Set(["GENERATED", "DOWNLOADED"]);

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "documents:request")) redirect("/");

  const t = await getTranslations("documents");
  const params = await searchParams;
  const requested = params.requested === "1";

  // Re-resolve the User id from the DB (email is stable across re-seeds),
  // same defense as requestWorkCertificate — the JWT-cached id can dangle
  // after a db:reset.
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  const myRequests = dbUser ? await getMyDocumentRequests(dbUser.id) : [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        {requested && (
          <div className="rounded-lg border bg-background p-4 text-sm">
            {t("requestSuccess")}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-lg border bg-muted p-2">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle>{t("workCertificateTitle")}</CardTitle>
                <CardDescription>
                  {t("workCertificateDescription")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={requestWorkCertificate}>
              <Button type="submit">{t("requestWorkCertificate")}</Button>
            </form>
          </CardContent>
        </Card>

        {myRequests.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("myRequests.title")}</h2>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("myRequests.type")}</TableHead>
                    <TableHead>{t("myRequests.requestedOn")}</TableHead>
                    <TableHead>{t("myRequests.generatedOn")}</TableHead>
                    <TableHead>{t("myRequests.status")}</TableHead>
                    <TableHead className="text-right">{t("myRequests.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{t(`type.${r.type}` as "type.WORK_CERTIFICATE")}</TableCell>
                      <TableCell className="tabular-nums">{r.requestedAt}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {r.generatedAt ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant={r.status === "REJECTED" ? "destructive" : "secondary"}>
                            {t(`status.${r.status}` as "status.REQUESTED")}
                          </Badge>
                          {r.status === "REJECTED" && r.rejectionNote && (
                            <p className="text-xs text-muted-foreground">
                              {t("myRequests.rejectionReason", { note: r.rejectionNote })}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {DOWNLOADABLE.has(r.status) && (
                          <ButtonLink
                            size="sm"
                            variant="outline"
                            href={`/api/documents/${r.id}/download`}
                          >
                            {t("myRequests.download")}
                          </ButtonLink>
                        )}
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
