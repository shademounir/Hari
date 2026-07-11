import { getRequestConfig } from "next-intl/server";
import { locales, type Locale } from "./routing";
import { getUserLocale } from "./locale";

// Resolves the active locale and loads its message catalog for every server
// request. Referenced by the next-intl plugin in next.config.ts.
//
// `requestLocale` is set when a caller asks for a SPECIFIC locale explicitly
// (e.g. `getTranslations({ locale, namespace })`) rather than the ambient one —
// used by the work-certificate PDF generator (SCRUM-081) to render in the
// requester's own locale, not whichever HR admin's cookie happens to be active
// when they fulfill the request. Everywhere else (pages, components) no
// explicit locale is requested, so this falls back to the NEXT_LOCALE cookie
// as before.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && (locales as readonly string[]).includes(requested)
      ? (requested as Locale)
      : await getUserLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
