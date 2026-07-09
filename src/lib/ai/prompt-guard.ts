/**
 * Basic prompt injection signatures.
 * This list is intentionally conservative and can be extended
 * in future sprints.
 */
const DOCUMENT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /disregard\s+(all\s+)?previous\s+instructions/gi,
  /forget\s+(all\s+)?previous\s+instructions/gi,
  /system\s+prompt/gi,
  /developer\s+message/gi,
  /you\s+are\s+now/gi,
  /act\s+as\s+/gi,
  /jailbreak/gi,
  /override\s+(the\s+)?instructions/gi,
  /reveal.*(password|secret|token|key)/gi,
  /print.*(password|secret|token|key)/gi,
  /execute\s+(this|command|instruction)/gi,
];

const REPLACEMENT = "[REMOVED: potential prompt injection]";

export function containsPromptInjection(text: string): boolean {
  return DOCUMENT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeRetrievedContent(text: string): string {
  return DOCUMENT_INJECTION_PATTERNS.reduce(
    (safeText, pattern) => safeText.replace(pattern, REPLACEMENT),
    text,
  );
}