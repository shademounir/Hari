import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getOrgSettings } from "@/lib/settings";
import { OrgSettingsProvider } from "@/components/org-settings-provider";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser(); // redirects to /login if signed out
  const nav = { name: user.name, email: user.email, role: user.role };
  const t = await getTranslations("nav");
  const orgSettings = await getOrgSettings();

  return (
    <OrgSettingsProvider value={orgSettings}>
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>
      <Sidebar user={nav} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav user={nav} />
        <main
          id="main"
          tabIndex={0}
          aria-label={t("mainContent")}
          className="flex-1 overflow-y-auto"
        >
          {children}
        </main>
      </div>
    </div>
    </OrgSettingsProvider>
  );
}
