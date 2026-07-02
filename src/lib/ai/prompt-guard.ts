/**
 * Basic prompt injection signatures.
 * This list is intentionally conservative and can be extended
 * in future sprints.
 */
const DOCUMENT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous\s+instructions/i,
  /forget\s+(all\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /you\s+are\s+now/i,
  /act\s+as\s+/i,
  /jailbreak/i,
  /override\s+(the\s+)?instructions/i,
  /reveal.*(password|secret|token|key)/i,
  /print.*(password|secret|token|key)/i,
  /execute\s+(this|command|instruction)/i,
];

const REPLACEMENT = "[REMOVED: potential prompt injection]";

export function containsPromptInjection(text: string): boolean {
  return DOCUMENT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeRetrievedContent(text: string): string {
  return DOCUMENT_INJECTION_PATTERNS.reduce(
    (safeText, pattern) => safeText.replace(pattern, REPLACEMENT),
    text
  );
}