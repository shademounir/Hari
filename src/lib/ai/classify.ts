// ─────────────────────────────────────────────────────────────────────────
// SCRUM-065: sensitivity classification of a user's chat request. A cheap, pure,
// bilingual (EN/FR) heuristic that runs BEFORE the model and labels the request
// so it can be traced on the AiEvent and reviewed by RH/Admin.
//
// IMPORTANT — this is a DETECTION / observability signal, NOT the enforcement.
// Access is already enforced server-side by per-role tool advertising + in-tool
// RBAC (`lib/ai/tools.ts`): the assistant is never even given a tool that could
// read another person's salary. This classifier records *what was asked* (e.g.
// "someone probed for a third party's pay") so it surfaces in the security
// dashboards and can drive alerting — it deliberately does not gate the reply.
//
// Pure + dependency-free so it's covered by the deterministic vitest suite. Kept
// deliberately tight (favor NOT flagging) so ordinary HR questions — "my leave",
// "the vacation policy", "my payslip" — are never misclassified as sensitive.
// Known limits are documented at the bottom of this file.
// ─────────────────────────────────────────────────────────────────────────

/** Sensitivity buckets. Precedence: CONFIDENTIAL > OUT_OF_SCOPE > NORMAL. */
export type SensitivityCategory = "NORMAL" | "CONFIDENTIAL" | "OUT_OF_SCOPE";

export type RequestClassification = {
  category: SensitivityCategory;
  /** Short, stable reason code (never PII) — e.g. "third_party_salary". Null for NORMAL. */
  signal: string | null;
};

// Compensation / pay terms (EN + FR).
const COMPENSATION =
  /\b(salary|salaries|salaire|salaires|wage|wages|payslip|paycheck|paystub|paie|paye|bulletin de (paie|salaire)|earn|earns|earning|earnings|gagne|gagnent|r[ée]mun[ée]rat\w*|compensation|bonus|primes?)\b/i;

// Someone OTHER than the signed-in user (a third party). "manager", a name's
// possessive ("Karim's"), collective ("everyone"), or a third-person possessive.
const THIRD_PARTY =
  /\b(manager|managers|boss|chef|responsable|colleague|colleagues|coll[èe]gue|coll[èe]gues|coworkers?|co-workers?|teammate|someone|somebody|anyone|everyone|everybody|quelqu'?un|tout le monde|other (employees?|persons?|people|staff|colleagues?)|another (employee|person)|autres? (employ[ée]s?|personnes?|salari[ée]s?|coll[èe]gues?)|his|her|hers|their|theirs|de (son|leur|ses|leurs)|du (manager|responsable|chef|coll[èe]gue))\b/i;

// A name's possessive: "Karim's", "Nadia’s". Signals a specific third party.
const NAME_POSSESSIVE = /\b[A-ZÀ-Þ][a-zà-ÿ]+['’]s\b/;

// Someone else's private personal / medical data.
const PERSONAL_PRIVATE =
  /\b(medical|health record|dossier m[ée]dical|diagnos\w*|illness|maladie|social security|s[ée]curit[ée] sociale|\bcnss\b|passport|passeport|home address|adresse (personnelle|du domicile|domicile)|personal phone|t[ée]l[ée]phone personnel|date of birth|date de naissance)\b/i;

// Clearly non-HR asks (coarse — see limits). Kept tight to avoid false positives.
const OFF_TOPIC =
  /\b(weather|m[ée]t[ée]o|tell me a joke|write (me )?(a|some) (joke|poem|story|essay|song|code|script)|recipe|recette|football|soccer|movie|film|stock price|crypto|bitcoin|who won|translate this into)\b/i;

function mentionsOther(text: string): boolean {
  return THIRD_PARTY.test(text) || NAME_POSSESSIVE.test(text);
}

/**
 * Classify a single user message. Deterministic and side-effect free.
 * - CONFIDENTIAL: asks for a THIRD party's pay or private/medical data.
 * - OUT_OF_SCOPE: clearly non-HR (coarse).
 * - NORMAL: everything else (the default — including anything about oneself).
 */
export function classifyRequest(text: string): RequestClassification {
  const t = (text ?? "").trim();
  if (!t) return { category: "NORMAL", signal: null };

  const other = mentionsOther(t);
  if (COMPENSATION.test(t) && other) {
    return { category: "CONFIDENTIAL", signal: "third_party_salary" };
  }
  if (PERSONAL_PRIVATE.test(t) && other) {
    return { category: "CONFIDENTIAL", signal: "third_party_personal" };
  }
  if (OFF_TOPIC.test(t)) {
    return { category: "OUT_OF_SCOPE", signal: "off_topic" };
  }
  return { category: "NORMAL", signal: null };
}

// ── Known limits (SCRUM-065) ───────────────────────────────────────────────
// - Heuristic, not semantic: novel phrasings or heavy typos can slip past, and a
//   benign sentence that happens to combine a pay word with a third-party word
//   can be flagged CONFIDENTIAL. It is a *signal*, never the access control.
// - OUT_OF_SCOPE is intentionally coarse (a small keyword set); most off-topic
//   asks are simply handled by the model declining, not by this label.
// - Enforcement stays where it belongs: per-role tool advertising + in-tool RBAC.
//   A future iteration could add a small LLM classifier for the ambiguous middle.
