import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getCollectionForAdmin } from "@/lib/kb";
import { PageHeader } from "@/components/layout/page-header";
import { CollectionForm } from "@/components/kb/collection-form";
import { updateCollectionAction } from "../../actions";

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "kb:manage")) redirect("/");
  const { id } = await params;
  const collection = await getCollectionForAdmin({ role: user.role }, id);
  if (!collection) notFound();

  const t = await getTranslations("kb");

  return (
    <>
      <PageHeader title={t("editCollection")} />
      <div className="p-4 md:p-8">
        <CollectionForm
          action={updateCollectionAction}
          submitLabel={t("save")}
          defaults={{
            id: collection.id,
            name: collection.name,
            slug: collection.slug,
            description: collection.description,
            image: collection.image,
            order: collection.order,
          }}
        />
      </div>
    </>
  );
}
