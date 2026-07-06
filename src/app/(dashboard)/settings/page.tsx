import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";

// Overview hub: a card per settings category. The category list is shared with the
// side-nav (SETTINGS_SECTIONS) so the two never drift.
export default async function SettingsOverviewPage() {
  const t = await getTranslations("settings");
  const sections = SETTINGS_SECTIONS.filter((s) => s.href !== "/settings");

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex h-full items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-background">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium">
                  {t(s.key)}
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{t(s.descKey)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
