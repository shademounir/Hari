/**
 * SCRUM-102
 * CNDP personal data detection.
 *
 * This module only detects categories of personal data.
 * It NEVER returns or stores the detected values.
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
  requiresReview: boolean;
}

const PATTERNS: Record<PersonalDataCategory, RegExp> = {
  EMAIL:
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,

  PHONE:
    /(?:\+212|0)(?:\s|-)?[5-7](?:\d(?:\s|-)?){8}/,

  NATIONAL_ID:
    /\b[A-Z]{1,2}\d{5,8}\b/i,

  PASSPORT:
    /\b[A-Z]{1,2}\d{6,9}\b/i,

  CNSS:
    /\b\d{6,10}\b/,
};

export function detectPersonalData(
  text: string,
): PersonalDataResult {
  const categories: PersonalDataCategory[] = [];

  for (const [category, regex] of Object.entries(PATTERNS)) {
    if (regex.test(text)) {
      categories.push(category as PersonalDataCategory);
    }
  }

  return {
    hasPersonalData: categories.length > 0,
    categories,
    requiresReview:
      categories.includes("NATIONAL_ID") ||
      categories.includes("PASSPORT") ||
      categories.includes("CNSS"),
  };
}