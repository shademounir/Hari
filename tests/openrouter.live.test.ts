import { describe, expect, it, type TestContext } from "vitest";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { getChatModel } from "@/lib/ai/providers";
import {
  isTransientLiveError,
  withLiveRetry,
} from "./helpers/live-retry";

// Live smoke test against OpenRouter.
// The suite skips automatically when no API key is configured.
const hasKey = Boolean(process.env.OPENROUTER_API_KEY);
const liveDescribe = hasKey ? describe : describe.skip;

/**
 * After all retry attempts are exhausted, provider-side transient failures
 * should not be reported as application regressions during the demo.
 */
function skipIfTransientProviderError(
  context: TestContext,
  error: unknown,
): never {
  if (isTransientLiveError(error)) {
    const message =
      error instanceof Error ? error.message : String(error);

    context.skip(
      `Skipped - OpenRouter remained temporarily unavailable after retries: ${message}`,
    );
  }

  throw error;
}

liveDescribe("OpenRouter (live)", () => {
  it(
    "generates text with the default model",
    async (context) => {
      try {
        const { text } = await withLiveRetry(
          () =>
            generateText({
              model: getChatModel("gpt-oss-120b"),
              prompt: "Reply with exactly the word: pong",
              maxRetries: 0,
            }),
          {
            attempts: 3,
            delayMs: 1_000,
          },
        );

        expect(text.toLowerCase()).toContain("pong");
      } catch (error) {
        skipIfTransientProviderError(context, error);
      }
    },
    45_000,
  );

  it(
    "calls a tool and uses its result (multi-step)",
    async (context) => {
      let called = false;

      try {
        const { steps, text } = await withLiveRetry(
          () =>
            generateText({
              model: getChatModel("gpt-oss-120b"),
              stopWhen: stepCountIs(3),
              tools: {
                getVacationDays: tool({
                  description:
                    "Get the user's remaining vacation days.",
                  inputSchema: z.object({}),
                  execute: async () => {
                    called = true;
                    return { remaining: 16 };
                  },
                }),
              },
              prompt:
                "How many vacation days do I have left? Use the tool, then tell me the number.",
            }),
          {
            attempts: 2,
            delayMs: 500,
          },
        );

        expect(called).toBe(true);

        const toolCalls = steps.flatMap((step) => step.toolCalls);

        expect(toolCalls.length).toBeGreaterThan(0);
        expect(text).toContain("16");
      } catch (error) {
        skipIfTransientProviderError(context, error);
      }
    },
    60_000,
  );
});
