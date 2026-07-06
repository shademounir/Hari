"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { locales, type Locale } from "@/i18n/routing";
import { setUserLocale } from "@/i18n/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Locale picker. Writes the NEXT_LOCALE cookie via a server action, then the
// router refresh re-renders the tree (server + client) in the chosen language.
export function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const active = useLocale();
  const [isPending, startTransition] = useTransition();

  function select(locale: Locale) {
    startTransition(() => {
      void setUserLocale(locale);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("label")} disabled={isPending} />
        }
      >
        <Languages className="size-4" />
        <span className="sr-only">{t("label")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => select(locale)}
            data-active={locale === active}
            className="data-[active=true]:font-semibold"
          >
            {t(locale)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
