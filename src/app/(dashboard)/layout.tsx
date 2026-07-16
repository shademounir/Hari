import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getOrgSettings } from "@/lib/settings";
import { getRoleLabels } from "@/lib/rbac-server";
import { OrgSettingsProvider } from "@/components/org-settings-provider";
import { RoleLabelsProvider } from "@/components/role-labels-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BreadcrumbLabelProvider } from "@/components/layout/breadcrumb-labels";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser(); // redirects to /login if signed out
  // `permissions` rides along so the sidebar and ⌘K gate links off the caller's
  // RESOLVED matrix — a role slug alone no longer says what it may do.
  const nav = {
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
  };
  const t = await getTranslations("nav");
  const orgSettings = await getOrgSettings();
  const roleLabels = await getRoleLabels(await getTranslations("roles"));

  return (
    <OrgSettingsProvider value={orgSettings}>
      <RoleLabelsProvider value={roleLabels}>
      {/* Lets pages hand the breadcrumb the real names behind their dynamic
          segments — the layout only ever sees the slug. */}
      <BreadcrumbLabelProvider>
        <div className="flex h-dvh overflow-hidden">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            {t("skipToContent")}
          </a>
          <Sidebar user={nav} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Topbar user={nav} />
            <main
              id="main"
              tabIndex={0}
              aria-label={t("mainContent")}
              className="flex-1 overflow-y-auto bg-muted/30"
            >
              {children}
            </main>
          </div>
        </div>
      </BreadcrumbLabelProvider>
      </RoleLabelsProvider>
    </OrgSettingsProvider>
  );
}
