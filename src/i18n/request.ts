import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

// Resolves the active locale (from the NEXT_LOCALE cookie) and loads its message
// catalog for every server request. Referenced by the next-intl plugin in
// next.config.ts.
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
