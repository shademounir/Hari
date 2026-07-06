import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { CollectionForm } from "@/components/kb/collection-form";
import { createCollectionAction } from "../../actions";

export default async function NewCollectionPage() {
  const user = await requireUser();
  if (!can(user.role, "kb:manage")) redirect("/");
  const t = await getTranslations("kb");

  return (
    <>
      <PageHeader title={t("newCollection")} />
      <div className="p-4 md:p-8">
        <CollectionForm action={createCollectionAction} submitLabel={t("createCollection")} />
      </div>
    </>
  );
}
