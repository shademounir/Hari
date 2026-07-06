import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";

// One guard for every settings sub-page (defense in depth: data-layer fns + server
// actions re-check too). Navigation between categories lives in the main sidebar
// (Settings → nested sub-items), so there's no secondary nav here.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!can(user.role, "admin:settings")) redirect("/");

  const t = await getTranslations("settings");

  return (
    <>
      <PageHeader title={t("title")} description={t("overviewDescription")} />
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">{children}</div>
    </>
  );
}
