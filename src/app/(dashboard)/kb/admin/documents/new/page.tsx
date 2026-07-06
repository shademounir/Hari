import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listCollectionsForAdmin } from "@/lib/kb";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentForm } from "@/components/kb/document-form";
import { createDocumentAction } from "../../actions";

export default async function NewDocumentPage() {
  const user = await requireUser();
  if (!can(user.role, "kb:manage")) redirect("/");
  const t = await getTranslations("kb");
  const collections = await listCollectionsForAdmin({ role: user.role });

  return (
    <div className="flex flex-col lg:h-full">
      <PageHeader title={t("newDocument")} description={t("draftNotice")} />
      <DocumentForm
        action={createDocumentAction}
        submitLabel={t("createDocument")}
        canSetAssistant={can(user.role, "admin:settings")}
        collections={collections.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          assistantEnabled: c.assistantEnabled,
        }))}
      />
    </div>
  );
}
