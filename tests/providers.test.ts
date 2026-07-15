import { describe, it, expect, beforeEach, afterAll } from "vitest";

import {
  CHAT_MODELS,
  DEFAULT_MODEL_ID,
  getAvailableChatModels,
  getChatModel,
} from "@/lib/ai/providers";

// Registry/resolution only — nothing here touches the network, so fake keys are
// enough to make a provider "configured".
const REAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "or-test-key";
  process.env.OPENAI_API_KEY = "sk-test-key";
  delete process.env.AI_GATEWAY_API_KEY;
});

afterAll(() => {
  process.env = { ...REAL_ENV };
});

/** The wrapped model keeps the underlying provider id, e.g. "openai.chat". */
const providerOf = (id: string | undefined) =>
  (getChatModel(id) as unknown as { provider: string }).provider;
const modelIdOf = (id: string | undefined) =>
  (getChatModel(id) as unknown as { modelId: string }).modelId;

describe("chat model registry", () => {
  it("DEFAULT_MODEL_ID names a real entry", () => {
    // A typo here silently degrades every chat to the fallback path.
    expect(CHAT_MODELS.some((m) => m.id === DEFAULT_MODEL_ID)).toBe(true);
  });

  it("model ids are unique", () => {
    // Two providers can expose the same underlying model (gateway vs direct
    // OpenAI both serve gpt-4o-mini), so the registry id must disambiguate.
    const ids = CHAT_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the default is a free OpenRouter model", () => {
    // The zero-cost-out-of-the-box promise: the default must never be a model
    // that bills. Paid entries stay selectable by hand.
    const d = CHAT_MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
    expect(d.provider).toBe("openrouter");
    expect(d.providerModelId).toMatch(/(^openrouter\/free$|:free$)/);
    expect(d.label).not.toMatch(/paid/i);
  });

  it("hides a provider's models when its key is absent", () => {
    delete process.env.OPENAI_API_KEY;
    const ids = getAvailableChatModels().map((m) => m.id);
    expect(ids).not.toContain("openai-gpt-4o-mini");
    expect(ids).toContain(DEFAULT_MODEL_ID);
  });
});

describe("model resolution", () => {
  it("resolves OpenAI through chat-completions, never the Responses API", () => {
    // The Responses API stores prompts and responses on OpenAI's servers unless
    // every call opts out (store defaults true there). That would retain names,
    // salaries and risk scores from tool results and break the metadata-only
    // contract (SCRUM-062/063, CNDP). Chat Completions does not store by default.
    const provider = providerOf("openai-gpt-4o-mini");
    expect(provider).toBe("openai.chat");
    expect(provider).not.toContain("responses");
  });

  it("an unknown model id falls back to the free default, not to a billing model", () => {
    // A stale `modelKey` from a client (or a removed registry entry) must not
    // quietly start charging. DEFAULT_MODEL_ID is what enforces this: it is free
    // and it is available whenever OpenRouter is, which is the documented setup.
    expect(modelIdOf("no-such-model-id")).toBe("openrouter/free");
    expect(modelIdOf(undefined)).toBe("openrouter/free");
  });

  it("still resolves when OpenRouter is absent and only a paid provider is configured", () => {
    // Then a billing model is the only way to answer at all, so taking it is
    // correct rather than a silent surprise.
    delete process.env.OPENROUTER_API_KEY;
    expect(modelIdOf("no-such-model-id")).toBe("gpt-4o-mini");
  });
});
