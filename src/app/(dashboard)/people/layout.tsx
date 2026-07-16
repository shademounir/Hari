import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";

// One gate for every people page, mirroring the settings layout (defense in
// depth: each page and every lib/users function re-checks too). It also owns the
// section's <h1> — these pages used to live under /settings, which supplied one,
// and moving them out left them headingless.
export default async function PeopleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Managing people is HR's (employee:manage), not the platform admin's
  // (admin:settings) — which is exactly why this section is not under /settings.
  if (!can(user, "employee:manage")) redirect("/");

  const t = await getTranslations("users");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">{children}</div>
    </>
  );
}
