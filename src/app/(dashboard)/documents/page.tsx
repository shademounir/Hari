import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";

import { requestWorkCertificate } from "@/app/(dashboard)/documents/actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

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
      </div>
    </>
  );
}