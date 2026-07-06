import type { Locale } from "@/i18n/routing";

// Type-safe translation keys and locale: `t("…")` autocompletes against en.json
// and a typo or missing key is a compile error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof import("./messages/en.json");
  }
}
