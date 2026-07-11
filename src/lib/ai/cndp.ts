/**
 * SCRUM-102
 * CNDP personal-data detection.
 *
 * Deterministic, keyword- and structure-based detection of personal-data
 * categories in a free-text message. It only reports WHICH categories are
 * present — it NEVER returns or stores the detected values.
 *
 * NOT yet wired into the runtime (no chat/guardrail path calls this). It is a
 * building block for a future CNDP input check; integrate it in
 * `lib/ai/guardrails.ts` alongside the injection/exfiltration detectors when a
 * dedicated requirement lands, rather than assuming detection is already live.
 */

export type PersonalDataCategory =
  | "EMAIL"
  | "PHONE"
  | "NATIONAL_ID"
  | "PASSPORT"
  | "CNSS";

export interface PersonalDataResult {
  hasPersonalData: boolean;
  categories: PersonalDataCategory[];
  /** High-risk government identifiers (CIN / passport / CNSS) → compliance review. */
  requiresReview: boolean;
}

// Ordered detectors (same shape as guardrails' pattern lists). Numeric
// identifiers are inherently ambiguous, so the ID/passport/CNSS patterns are
// bounded by digit-count or an explicit keyword to avoid flagging ordinary
// numbers (order ids, amounts, phone numbers) as personal data.
const DETECTORS: ReadonlyArray<{ category: PersonalDataCategory; regex: RegExp }> = [
  { category: "EMAIL", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },

  // Moroccan mobile/landline: +212 or leading 0, then 5–7 and 8 more digits,
  // tolerant of spaces/dashes between digits.
  { category: "PHONE", regex: /(?:\+212|0)(?:\s|-)?[5-7](?:\d(?:\s|-)?){8}/ },

  // CIN: 1–2 letters + 5–6 digits (e.g. AB123456). 5–6 digits keeps it
  // mutually exclusive with the 7–9-digit passport pattern below.
  { category: "NATIONAL_ID", regex: /\b[A-Z]{1,2}\d{5,6}\b/i },

  // Passport: 1–2 letters + 7–9 digits — a strictly longer numeric tail than CIN.
  { category: "PASSPORT", regex: /\b[A-Z]{1,2}\d{7,9}\b/i },

  // CNSS affiliation number: requires the explicit "CNSS" label before the
  // digits — a bare 6–10-digit number is far too common to treat as an identifier.
  { category: "CNSS", regex: /\bcnss\b[\s:#-]*\d{6,10}\b/i },
];

const REVIEW_CATEGORIES: ReadonlySet<PersonalDataCategory> = new Set([
  "NATIONAL_ID",
  "PASSPORT",
  "CNSS",
]);

export function detectPersonalData(text: string): PersonalDataResult {
  const categories = DETECTORS.filter((d) => d.regex.test(text)).map((d) => d.category);

  return {
    hasPersonalData: categories.length > 0,
    categories,
    requiresReview: categories.some((c) => REVIEW_CATEGORIES.has(c)),
  };
}
