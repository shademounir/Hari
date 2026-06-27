// Single source of truth for the supported locales. Shared by the request
// config, the locale cookie helpers, and the language switcher.
export const locales = ["en", "fr"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// Per-locale settings the server needs beyond the message catalog: the language
// name injected into the chat system prompt, and the BCP-47 tag for date
// formatting. Keyed by Locale, so adding a locale to `locales` forces an entry
// here (compile error) instead of silently defaulting the assistant to English.
export const localeConfig: Record<Locale, { language: string; dateLocale: string }> = {
  en: { language: "English", dateLocale: "en-US" },
  fr: { language: "French", dateLocale: "fr-FR" },
};
