"use server";

import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "./routing";

// Cookie-based locale (next-intl "without i18n routing"). The locale is a
// per-user preference, not part of the URL — so there's no middleware and the
// app tree stays flat. `NEXT_LOCALE` is the name next-intl reads by default.
const COOKIE_NAME = "NEXT_LOCALE";

export async function getUserLocale(): Promise<Locale> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

export async function setUserLocale(locale: Locale) {
  (await cookies()).set(COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}
