// ─────────────────────────────────────────────────────────────────────────
// Chat model registry. Two providers, selectable per request:
//   • OpenRouter (default) — free models, great for a zero-cost demo.
//   • Vercel AI Gateway   — one key, many providers (OpenAI, Google, …).
// A model only gets the <think>…</think> reasoning extractor when it natively
// emits a reasoning channel (`reasoning: true`) — see getChatModel.
// ─────────────────────────────────────────────────────────────────────────
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway } from "@ai-sdk/gateway";
import {
  wrapLanguageModel,
  extractReasoningMiddleware,
  type LanguageModel,
} from "ai";

export type ChatProvider = "openrouter" | "gateway";

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
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B",
    provider: "openrouter",
    providerModelId: "openai/gpt-oss-120b:free",
    reasoning: true, // emits a reasoning channel -> powers the thinking UI
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

// Default: a free model that reliably does BOTH tool-calling and reasoning,
// so the tool-call UI and the thinking UI both light up out of the box.
export const DEFAULT_MODEL_ID = "gpt-oss-120b";

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

/** Whether the Vercel AI Gateway is configured. Server-only (reads a secret env). */
export function isGatewayConfigured(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY;
}

/**
 * Models selectable in the current environment. Gateway models are hidden when no
 * AI_GATEWAY_API_KEY is set, so the picker never offers a model that would fail at
 * request time. Server-only — compute it in a Server Component and pass it down.
 */
export function getAvailableChatModels(): ChatModel[] {
  const gateway = isGatewayConfigured();
  return CHAT_MODELS.filter((m) => m.provider === "openrouter" || gateway);
}

/** Resolve a registry id, falling back to the documented DEFAULT_MODEL_ID. */
function getChatModelMeta(id: string | undefined): ChatModel {
  const found = CHAT_MODELS.find((m) => m.id === id);
  if (found) return found;
  if (id) console.warn(`[ai] unknown chat model "${id}" — falling back to ${DEFAULT_MODEL_ID}`);
  return CHAT_MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ?? CHAT_MODELS[0];
}

/** Resolve a registry id to a ready-to-use LanguageModel. */
export function getChatModel(id: string | undefined): LanguageModel {
  const meta = getChatModelMeta(id);
  const base: LanguageModel =
    meta.provider === "openrouter"
      ? openrouterProvider()(meta.providerModelId)
      : gatewayProvider()(meta.providerModelId);

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
