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

/** How many trailing user messages to concatenate for the split-injection check. */
export const MAX_JOINED_MESSAGES = 6;

// Instruction-override / jailbreak markers. Kept deliberately tight to avoid
// false positives on legitimate questions that merely mention these words. The
// app is bilingual (EN/FR), so each intent is covered in both languages.
const INJECTION_PATTERNS: RegExp[] = [
  // English
  /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?|rules?)\b/i,
  /\bdisregard\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions?|rules?)\b/i,
  /\bforget\s+(?:everything|all)\s+(?:above|before|previous)\b/i,
  /\b(?:you\s+are\s+now|from\s+now\s+on,?\s+you\s+are)\s+(?:in\s+)?(?:developer|dev|dan|jailbreak|god)\s*mode\b/i,
  /\bpretend\s+(?:that\s+)?you\s+(?:are|have)\s+no\s+(?:rules|restrictions|guardrails)\b/i,
  // French
  /\b(?:ignore|ignorez|oublie|oubliez|néglige|négligez)\s+(?:tou(?:te|s|tes)\s+)?(?:les\s+|tes\s+|ces\s+)?(?:instructions?|consignes?|règles?)\s+(?:précédentes?|antérieures?|ci-dessus|au-dessus|plus\s+haut)\b/i,
  /\b(?:tu\s+es\s+maintenant|désormais,?\s+tu\s+es)\s+(?:en\s+)?mode\s+(?:développeur|dev|dan|jailbreak)\b/i,
  /\bfais\s+comme\s+si\s+tu\s+n['’]?(?:avais|as)\s+(?:aucune|plus\s+de|pas\s+de)\s+(?:règles?|restrictions?|limites?)\b/i,
];

// Attempts to make the assistant reveal its hidden configuration. Note: the
// object must be qualified (system / initial / hidden / "prompt above") — a bare
// "your instructions for <task>" is a LEGITIMATE question and must NOT trip this.
const EXFILTRATION_PATTERNS: RegExp[] = [
  // English
  /\b(?:reveal|show|print|repeat|output|reprint|display|leak)\b[^.?!]{0,40}\b(?:system\s+prompt|initial\s+instructions?|prompt\s+above|hidden\s+prompt)\b/i,
  /\bwhat\s+(?:is|are|was|were)\b[^.?!]{0,30}\b(?:your\s+system\s+prompt|your\s+initial\s+instructions?|the\s+system\s+prompt)\b/i,
  // French
  /\b(?:révèle|revele|affiche|montre|imprime|répète|repete|divulgue|donne-moi)\b[^.?!]{0,40}\b(?:prompt\s+système|instructions?\s+(?:initiales?|système)|consignes?\s+(?:système|initiales?)|invite\s+système)\b/i,
];

const anyMatch = (patterns: RegExp[], text: string) => patterns.some((re) => re.test(text));

// Fold away cheap evasion before matching: NFKC compatibility normalization
// (undoes many homoglyph/full-width tricks) + stripping zero-width characters
// that can be sprinkled inside a trigger word ("ig<zwsp>nore"). Length is still
// measured on the ORIGINAL text so a paste-bomb can't hide behind normalization.
function normalizeForMatch(text: string): string {
  return (text ?? "").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
}

/**
 * Inspect a single user message. Returns the first rule it trips, or `{ blocked:
 * false }`. Order: oversize → exfiltration → injection (exfiltration is the more
 * specific case and is reported distinctly for the Admin alert).
 */
export function inspectUserInput(text: string): GuardVerdict {
  const value = text ?? "";
  if (value.length > MAX_INPUT_CHARS) return { blocked: true, rule: "oversize" };
  const normalized = normalizeForMatch(value);
  if (anyMatch(EXFILTRATION_PATTERNS, normalized)) return { blocked: true, rule: "system_exfiltration" };
  if (anyMatch(INJECTION_PATTERNS, normalized)) return { blocked: true, rule: "prompt_injection" };
  return { blocked: false };
}

/**
 * Inspect every user message in the turn (not just the latest) plus the message
 * count. Blocks on the first offender; returns the tripped rule for the caller's
 * GUARD_BLOCK + Alert.
 *
 * Also checks the CONCATENATION of the recent user messages: the whole turn is
 * sent to the model, so an injection split across two messages ("ignore all
 * previous" + "instructions and …") must be caught even though neither half trips
 * on its own. The join uses a space so a trigger straddling the boundary matches.
 */
export function inspectConversation(userTexts: string[]): GuardVerdict {
  if (userTexts.length > MAX_USER_MESSAGES) return { blocked: true, rule: "oversize" };
  for (const text of userTexts) {
    const verdict = inspectUserInput(text);
    if (verdict.blocked) return verdict;
  }
  // Split-injection check on the recent window (patterns only — not oversize).
  const joined = normalizeForMatch(userTexts.slice(-MAX_JOINED_MESSAGES).join(" "));
  if (anyMatch(EXFILTRATION_PATTERNS, joined)) return { blocked: true, rule: "system_exfiltration" };
  if (anyMatch(INJECTION_PATTERNS, joined)) return { blocked: true, rule: "prompt_injection" };
  return { blocked: false };
}
