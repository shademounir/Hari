import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type OrgSettingsValues = { currency: string; timezone: string };

// Supported choices for the Settings form. Currency codes are ISO-4217 (used by
// Intl.NumberFormat); timezones are IANA names (used by Intl.DateTimeFormat).
export const CURRENCIES = ["MAD", "EUR", "USD", "GBP", "AED", "SAR"] as const;
export const TIMEZONES = [
  "UTC",
  "Africa/Casablanca",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
] as const;

export const DEFAULT_ORG_SETTINGS: OrgSettingsValues = {
  currency: "MAD",
  timezone: "UTC",
};

const SINGLETON_ID = "singleton";

// Reads the single org-settings row, creating it with defaults on first access.
// `cache` dedupes the query within a single server request. Values are clamped to
// the supported lists so a stale/hand-edited row can never feed an invalid currency
// to Intl.NumberFormat or an invalid timezone to Intl.DateTimeFormat (which throw).
export const getOrgSettings = cache(async (): Promise<OrgSettingsValues> => {
  const row = await prisma.orgSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
    select: { currency: true, timezone: true },
  });
  return {
    currency: (CURRENCIES as readonly string[]).includes(row.currency)
      ? row.currency
      : DEFAULT_ORG_SETTINGS.currency,
    timezone: (TIMEZONES as readonly string[]).includes(row.timezone)
      ? row.timezone
      : DEFAULT_ORG_SETTINGS.timezone,
  };
});

export async function writeOrgSettings(values: OrgSettingsValues) {
  await prisma.orgSettings.upsert({
    where: { id: SINGLETON_ID },
    update: values,
    create: { id: SINGLETON_ID, ...values },
  });
}
