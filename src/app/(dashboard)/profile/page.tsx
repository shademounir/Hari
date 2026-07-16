import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { actorOf, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getOwnProfile } from "@/lib/profile";
import { PageHeader } from "@/components/layout/page-header";
import { SetBreadcrumbLabels } from "@/components/layout/breadcrumb-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
  const user = await requireUser();
  if (!can(user, "profile:edit:self")) redirect("/");

  const profile = await getOwnProfile(actorOf(user));
  if (!profile) redirect("/");

  const t = await getTranslations("profile");
  const locale = await getLocale();

  // HR-controlled facts, shown so you can check them — but not edit them. Letting
  // people rewrite their own title or manager would corrupt the org chart and
  // every analytic built on it.
  const facts: { label: string; value: string | null }[] = [
    { label: t("jobTitle"), value: profile.title },
    { label: t("department"), value: profile.department },
    { label: t("location"), value: profile.location },
    { label: t("manager"), value: profile.managerName },
    {
      label: t("startDate"),
      value: profile.startDate
        ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(profile.startDate)
        : null,
    },
  ];

  return (
    <>
      {/* /profile is not in the primary nav, so the breadcrumb has only the URL
          to go on — hand it the real, translated name. */}
      <SetBreadcrumbLabels labels={{ "/profile": t("nav") }} />
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initialName={profile.name}
              initialAvatarUrl={profile.avatarUrl}
              email={profile.email}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("employmentTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("employmentHint")}</p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-4 border-b py-2 text-sm">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-right font-medium">{f.value || t("notSet")}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
