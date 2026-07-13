// ─────────────────────────────────────────────────────────────────────────
// Deterministic input guardrails (SCRUM-063). A cheap, pure pre-model check on
// the latest user message: it blocks obvious abuse/injection BEFORE spending a
// model call, and its verdict feeds an AiEvent (GUARD_BLOCK) + an Alert.
//
// Pure + dependency-free so it's covered by the deterministic vitest suite. It
// is a coarse safety net, NOT a content classifier — favor letting text through
// (the model + per-tool RBAC are the primary guardrails); only catch the
// unambiguous cases here.
// ─────────────────────────────────────────────────────────────────────────

/** Reasons a message can be blocked. Stored as AiEvent.guardRule / shown via i18n. */
export type GuardRule = "oversize" | "prompt_injection" | "system_exfiltration";

export type GuardVerdict = { blocked: false } | { blocked: true; rule: GuardRule };

/** Hard cap on a single user message. Well above any real HR question; a message
 *  this long is almost always a paste-bomb or an attempt to bury an injection. */
export const MAX_INPUT_CHARS = 8_000;

/** Cap on user messages per turn. The whole client-controlled `messages[]` is
 *  sent to the model, so an injection in an earlier message (or a paste-bomb of
 *  many messages) has to be caught too, not just the latest message. */
export const MAX_USER_MESSAGES = 80;

// Instruction-override / jailbreak markers. Kept deliberately tight to avoid
// false positives on legitimate questions that merely mention these words.
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?)\b/i,
  /\bdisregard\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions?|rules?)\b/i,
  /\bforget\s+(?:everything|all)\s+(?:above|before|previous)\b/i,
  /\b(?:you\s+are\s+now|from\s+now\s+on,?\s+you\s+are)\s+(?:in\s+)?(?:developer|dev|dan|jailbreak|god)\s*mode\b/i,
  /\bpretend\s+(?:that\s+)?you\s+(?:are|have)\s+no\s+(?:rules|restrictions|guardrails)\b/i,
];

// Attempts to make the assistant reveal its hidden configuration.
const EXFILTRATION_PATTERNS: RegExp[] = [
  /\b(?:reveal|show|print|repeat|output|reprint|display|leak)\b[^.?!]{0,40}\b(?:system\s+prompt|initial\s+instructions?|your\s+instructions?|prompt\s+above|hidden\s+prompt)\b/i,
  /\bwhat\s+(?:is|are|was|were)\b[^.?!]{0,30}\b(?:your\s+system\s+prompt|your\s+initial\s+instructions?|the\s+system\s+prompt)\b/i,
];

const anyMatch = (patterns: RegExp[], text: string) => patterns.some((re) => re.test(text));

/**
 * Inspect a single user message. Returns the first rule it trips, or `{ blocked:
 * false }`. Order: oversize → exfiltration → injection (exfiltration is the more
 * specific case and is reported distinctly for the Admin alert).
 */
export function inspectUserInput(text: string): GuardVerdict {
  const value = text ?? "";
  if (value.length > MAX_INPUT_CHARS) return { blocked: true, rule: "oversize" };
  if (anyMatch(EXFILTRATION_PATTERNS, value)) return { blocked: true, rule: "system_exfiltration" };
  if (anyMatch(INJECTION_PATTERNS, value)) return { blocked: true, rule: "prompt_injection" };
  return { blocked: false };
}

/**
 * Inspect every user message in the turn (not just the latest) plus the message
 * count. Blocks on the first offender; returns the tripped rule for the caller's
 * GUARD_BLOCK + Alert.
 */
export function inspectConversation(userTexts: string[]): GuardVerdict {
  if (userTexts.length > MAX_USER_MESSAGES) return { blocked: true, rule: "oversize" };
  for (const text of userTexts) {
    const verdict = inspectUserInput(text);
    if (verdict.blocked) return verdict;
  }
  return { blocked: false };
}
