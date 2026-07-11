/**
 * High-confidence prompt-injection signatures for text that reaches the model as
 * *content* (retrieved handbook chunks, uploaded documents).
 *
 * These are deliberately narrow: each pattern targets an imperative attempt to
 * subvert the assistant, not ordinary policy wording. Earlier broad catch-alls
 * (`system prompt`, `you are now`, `act as`) matched legitimate handbook text such
 * as "act as mentors" or "you are now eligible for benefits" and rewrote it to the
 * removed-marker, which the model then cited verbatim — an accuracy regression on
 * retrieval. If you extend this list, keep it anchored to an injection verb.
 *
 * NOTE: no `g` flag. `RegExp.prototype.test` on a global regex advances and persists
 * `lastIndex` on the shared module-level object, so repeated `.test()` calls on the
 * same string alternate true/false. These are used with `.test()`/`.replace()`, never
 * iterated, so `g` is both unnecessary and a correctness hazard.
 */
const DOCUMENT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /override\s+(the\s+)?(system\s+)?instructions/i,
  /(reveal|repeat|print|show|expose)[^.\n]{0,40}\b(system\s+prompt|developer\s+message)/i,
  /you\s+are\s+now\s+(a\s+|an\s+)?(dan\b|jailbroken|an?\s+unrestricted|in\s+developer\s+mode)/i,
  /\bjailbreak\b/i,
  /(reveal|show|print|leak|expose)[^.\n]{0,40}\b(password|secret|api[\s-]?key|token|credential)/i,
  /execute\s+(this|the\s+following)\s+(command|instruction|code)/i,
];

const REPLACEMENT = "[REMOVED: potential prompt injection]";

export function containsPromptInjection(text: string): boolean {
  return DOCUMENT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeRetrievedContent(text: string): string {
  return DOCUMENT_INJECTION_PATTERNS.reduce((safeText, pattern) => {
    // The source patterns are non-global (safe for `.test()` above). Replacement must
    // hit every occurrence, so build a one-off global variant here rather than flagging
    // the shared regex `g` and reintroducing the `lastIndex` hazard.
    const all = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    return safeText.replace(all, REPLACEMENT);
  }, text);
}