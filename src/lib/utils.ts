import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format a salary in the org's configured currency, grouped per the active UI
// locale. Currency comes from OrgSettings (see lib/settings.ts); locale from
// next-intl. One helper so the directory and payslip cards can't drift.
export function formatCurrency(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

/** "Nadia Benali" → "NB". The avatar fallback when there's no picture. */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
