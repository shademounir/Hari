// ─────────────────────────────────────────────────────────────────────────
// Chat model registry. Two providers, selectable per request:
//   • OpenRouter (default) — free models, great for a zero-cost demo.
//   • Vercel AI Gateway   — one key, many providers (OpenAI, Google, …).
// Every model is wrapped with `extractReasoningMiddleware` so any <think>…</think>
// output is surfaced as a proper "reasoning" part (powers the thinking UI).
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
  id: string; // stable key used by the UI selector
  label: string;
  provider: ChatProvider;
  modelId: string; // provider-specific model identifier
  reasoning: boolean; // whether it natively emits reasoning tokens
};

// Add/disable models here. Free OpenRouter ids end in ":free".
// (Free models come and go — if one 404s/429s, swap it or use "openrouter/free".)
export const CHAT_MODELS: ChatModel[] = [
  {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B",
    provider: "openrouter",
    modelId: "openai/gpt-oss-120b:free",
    reasoning: true, // emits a reasoning channel -> powers the thinking UI
  },
  {
    id: "nemotron-super",
    label: "Nemotron 3 Super 120B",
    provider: "openrouter",
    modelId: "nvidia/nemotron-3-super-120b-a12b:free",
    reasoning: false,
  },
  {
    id: "openrouter-auto",
    label: "OpenRouter Auto",
    provider: "openrouter",
    modelId: "openrouter/free", // auto-routes to an available free model
    reasoning: false,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "gateway",
    modelId: "openai/gpt-4o-mini",
    reasoning: false,
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.0 Flash",
    provider: "gateway",
    modelId: "google/gemini-2.0-flash",
    reasoning: false,
  },
];

// Default: a free model that reliably does BOTH tool-calling and reasoning,
// so the tool-call UI and the thinking UI both light up out of the box.
export const DEFAULT_MODEL_ID = "gpt-oss-120b";

export function getChatModelMeta(id: string | undefined): ChatModel {
  return CHAT_MODELS.find((m) => m.id === id) ?? CHAT_MODELS[0];
}

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });

/** Resolve a registry id to a ready-to-use LanguageModel. */
export function getChatModel(id: string | undefined): LanguageModel {
  const meta = getChatModelMeta(id);
  const base: LanguageModel =
    meta.provider === "openrouter"
      ? openrouter(meta.modelId)
      : gateway(meta.modelId);

  return wrapLanguageModel({
    model: base,
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
}
