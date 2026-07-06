import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getDocumentForAdmin, listCollectionsForAdmin } from "@/lib/kb";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentForm } from "@/components/kb/document-form";
import {
  updateDocumentAction,
  publishDocumentAction,
  unpublishDocumentAction,
  archiveDocumentAction,
} from "../../actions";

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "kb:manage")) redirect("/");
  const { id } = await params;
  const caller = { role: user.role };

  const [doc, collections] = await Promise.all([
    getDocumentForAdmin(caller, id),
    listCollectionsForAdmin(caller),
  ]);
  if (!doc) notFound();

  const t = await getTranslations("kb");

  return (
    <div className="flex flex-col lg:h-full">
      <PageHeader title={t("editDocument")} />

      <DocumentForm
        action={updateDocumentAction}
          submitLabel={t("save")}
          published={doc.status === "PUBLISHED"}
          canSetAssistant={can(user.role, "admin:settings")}
          status={doc.status}
          viewHref={doc.status === "PUBLISHED" ? `/kb/${doc.collection.slug}/${doc.slug}` : undefined}
          lifecycle={{
            publish: publishDocumentAction,
            unpublish: unpublishDocumentAction,
            archive: archiveDocumentAction,
          }}
          collections={collections.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            assistantEnabled: c.assistantEnabled,
          }))}
          defaults={{
            id: doc.id,
            title: doc.title,
            slug: doc.slug,
            content: doc.content,
            collectionId: doc.collectionId,
            visibility: doc.visibility,
            tags: doc.tags,
            assistantOverride: doc.assistantEnabled,
          }}
        />
    </div>
  );
}
