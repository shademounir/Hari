import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { PendingDocumentRequests } from "@/components/documents/pending-document-requests";
import { getPendingDocumentRequests, resolveCaller } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

// SCRUM-080: HR validation queue for pending GeneratedDocument requests.
export default async function DocumentRequestsPage() {
  const user = await requireUser();
  if (!can(user.role, "documents:validate")) redirect("/");

  const caller = await resolveCaller(user);
  const t = await getTranslations("documents.requests");
  const requests = await getPendingDocumentRequests(caller);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="space-y-6 p-4 md:p-8">
        <PendingDocumentRequests rows={requests} />
      </div>
    </>
  );
}
