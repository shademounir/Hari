// ─────────────────────────────────────────────────────────────────────────
// Chat model registry. Three providers, selectable per request:
//   • OpenRouter (default) — free models, great for a zero-cost demo.
//   • OpenAI direct        — OPENAI_API_KEY; paid, but steady and fast.
//   • Vercel AI Gateway    — one key, many providers (OpenAI, Google, …).
// A model only gets the <think>…</think> reasoning extractor when it natively
// emits a reasoning channel (`reasoning: true`) — see getChatModel.
// ─────────────────────────────────────────────────────────────────────────
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import {
  wrapLanguageModel,
  extractReasoningMiddleware,
  type LanguageModel,
} from "ai";

export type ChatProvider = "openrouter" | "gateway" | "openai";

export type ChatModel = {
  id: string; // stable key used by the UI selector + the request body (`modelKey`)
  label: string;
  provider: ChatProvider;
  providerModelId: string; // provider-specific model identifier
  reasoning: boolean; // whether it natively emits reasoning tokens (powers the thinking UI)
};

// Add/disable models here. Free OpenRouter ids end in ":free".
// (Free models come and go — if one 404s/429s, swap it or use "openrouter/free".)
export const CHAT_MODELS: ChatModel[] = [
  {
    id: "gemini-byok",
    // NOTE: routes through the shared OPENROUTER_API_KEY (not a per-user key), and
    // google/gemini-2.5-flash is a PAID model with no reasoning channel. Selecting it
    // bills the project account and leaves the thinking UI dark — it is not the default.
    label: "Gemini 2.5 Flash (paid)",
    provider: "openrouter",
    providerModelId: "google/gemini-2.5-flash",
    reasoning: false,
  },
  {
    id: "nemotron-super",
    label: "Nemotron 3 Super 120B",
    provider: "openrouter",
    providerModelId: "nvidia/nemotron-3-super-120b-a12b:free",
    reasoning: false,
  },
  {
    id: "openrouter-auto",
    label: "OpenRouter Auto",
    provider: "openrouter",
    providerModelId: "openrouter/free", // auto-routes to an available free model
    reasoning: false,
  },
  // OpenAI direct (OPENAI_API_KEY). PAID: these bill the project's own OpenAI
  // account, so they are selectable but never the default. Unlike the free tier
  // they don't get retired underneath us, which makes them the reliable choice
  // for a demo that has to work on the day.
  {
    id: "openai-gpt-4o-mini",
    label: "GPT-4o mini (paid)",
    provider: "openai",
    providerModelId: "gpt-4o-mini",
    reasoning: false,
  },
  {
    id: "openai-gpt-4.1-mini",
    label: "GPT-4.1 mini (paid)",
    provider: "openai",
    providerModelId: "gpt-4.1-mini",
    reasoning: false,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "gateway",
    providerModelId: "openai/gpt-4o-mini",
    reasoning: false,
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.0 Flash",
    provider: "gateway",
    providerModelId: "google/gemini-2.0-flash",
    reasoning: false,
  },
];

// Default: a FREE model that does tool-calling, so the tool-call UI lights up out of
// the box at zero cost. The "(paid)" entries above stay selectable but must never be
// the default — they bill a real account.
//
// "openrouter-auto" routes to whichever free model is currently available, which is
// deliberate: this was a pinned "openai/gpt-oss-120b:free" until OpenRouter retired and
// delisted that slug, so every default chat 404'd. Pinning one free slug makes the demo
// hostage to that slug's lifetime; the auto-router survives a retirement. When a demo
// must not depend on the free tier at all, set OPENAI_API_KEY and pick a paid model.
export const DEFAULT_MODEL_ID = "openrouter-auto";

// The closed vocabulary of chat error codes the server emits and the client
// localizes (chat.errors.<code>). Single source of truth so the two sides can't
// drift — imported by both route.ts (producer) and chat.tsx (consumer).
export const CHAT_ERROR_CODES = [
  "auth_missing",
  "rate_limited",
  "model_unavailable",
  "session_expired",
  "network",
  "generic",
] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

// Lazy, memoized provider clients. Created on first use (never at module load),
// so a missing/empty key can't crash the whole route at import time — only a
// request that actually needs that provider fails, with a clear, specific error
// the route maps to a localized message.
let _openrouter: ReturnType<typeof createOpenRouter> | undefined;
let _gateway: ReturnType<typeof createGateway> | undefined;
let _openai: ReturnType<typeof createOpenAI> | undefined;

function openrouterProvider() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  return (_openrouter ??= createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }));
}

function gatewayProvider() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }
  return (_gateway ??= createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY }));
}

function openaiProvider() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return (_openai ??= createOpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

/** Whether the Vercel AI Gateway is configured. Server-only (reads a secret env). */
export function isGatewayConfigured(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY;
}

/** Whether OpenRouter is configured. Server-only (reads a secret env). */
export function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Whether a direct OpenAI key is configured. Server-only (reads a secret env). */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Is this provider usable in this env? One place, so the picker and the
 *  resolver can never disagree about what's runnable. */
function isConfigured(provider: ChatProvider): boolean {
  switch (provider) {
    case "openrouter":
      return isOpenRouterConfigured();
    case "gateway":
      return isGatewayConfigured();
    case "openai":
      return isOpenAIConfigured();
  }
}

/**
 * Models selectable in the current environment. A provider's models are hidden
 * when its key is absent, so the picker never offers a model that would fail at
 * request time — this now gates OpenRouter too (not just gateway), so a
 * gateway-only deployment doesn't advertise OpenRouter models it can't run.
 * Server-only — compute it in a Server Component and pass it down.
 */
export function getAvailableChatModels(): ChatModel[] {
  return CHAT_MODELS.filter((m) => isConfigured(m.provider));
}

/**
 * Resolve a registry id to a model that is actually AVAILABLE in this env. Falls
 * back to the documented default when it's available, else the first available
 * model, else the first registered model (whose provider-key error the route then
 * maps to a localized message). This prevents defaulting to an OpenRouter model on
 * a gateway-only deployment.
 */
function getChatModelMeta(id: string | undefined): ChatModel {
  const available = getAvailableChatModels();
  const pick = (mid: string | undefined) => available.find((m) => m.id === mid);
  const found = pick(id);
  if (found) return found;
  if (id) console.warn(`[ai] chat model "${id}" is unavailable in this env — falling back`);
  return pick(DEFAULT_MODEL_ID) ?? available[0] ?? CHAT_MODELS[0];
}

/** Resolve a registry id to a ready-to-use LanguageModel. */
export function getChatModel(id: string | undefined): LanguageModel {
  const meta = getChatModelMeta(id);
  // A switch, not a lookup table: it stays exhaustive over ChatProvider (a new
  // provider fails the build here) and it returns the providers' concrete model
  // types. Annotating this `LanguageModel` would widen it to `string | ...`,
  // which wrapLanguageModel below won't take.
  const base = (() => {
    switch (meta.provider) {
      case "openrouter":
        return openrouterProvider()(meta.providerModelId);
      case "gateway":
        return gatewayProvider()(meta.providerModelId);
      case "openai":
        return openaiProvider()(meta.providerModelId);
    }
  })();

  // Wrap EVERY model with the reasoning extractor. It's a no-op when no
  // <think>…</think> appears, and it guarantees any model that does emit them —
  // including whatever `openrouter-auto` routes to, or a model mislabeled
  // reasoning:false — has them surfaced in the thinking UI instead of leaking raw
  // tags into the answer. The `reasoning` flag is metadata for the settings badge
  // only; it deliberately does not gate this.
  return wrapLanguageModel({
    model: base,
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
}
