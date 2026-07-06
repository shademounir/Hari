import { describe, it, expect, type TestContext } from "vitest";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getChatModel } from "@/lib/ai/providers";

// Live smoke test against OpenRouter. Skips automatically if no key is set.
const hasKey = !!process.env.OPENROUTER_API_KEY;
const d = hasKey ? describe : describe.skip;

// The free model is occasionally rate-limited upstream; that's an infra condition,
// not a regression — skip (don't fail) the smoke test when it happens.
function isRateLimited(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return (
    msg.includes("rate-limit") ||
    msg.includes("rate limit") ||
    msg.includes("temporarily") ||
    msg.includes("429")
  );
}

function skipIfRateLimited(ctx: TestContext, e: unknown): never {
  if (isRateLimited(e)) ctx.skip(`Skipped — provider rate-limited upstream: ${(e as Error).message}`);
  throw e;
}

d("OpenRouter (live)", () => {
  it("generates text with the default model", async (ctx) => {
    try {
      const { text } = await generateText({
        model: getChatModel("gpt-oss-120b"),
        prompt: "Reply with exactly the word: pong",
      });
      expect(text.toLowerCase()).toContain("pong");
    } catch (e) {
      skipIfRateLimited(ctx, e);
    }
  }, 30_000);

  it("calls a tool and uses its result (multi-step)", async (ctx) => {
    let called = false;
    try {
      const { steps, text } = await generateText({
        model: getChatModel("gpt-oss-120b"),
        stopWhen: stepCountIs(3),
        tools: {
          getVacationDays: tool({
            description: "Get the user's remaining vacation days.",
            inputSchema: z.object({}),
            execute: async () => {
              called = true;
              return { remaining: 16 };
            },
          }),
        },
        prompt: "How many vacation days do I have left? Use the tool, then tell me the number.",
      });
      expect(called).toBe(true);
      const toolCalls = steps.flatMap((s) => s.toolCalls);
      expect(toolCalls.length).toBeGreaterThan(0);
      expect(text).toContain("16");
    } catch (e) {
      skipIfRateLimited(ctx, e);
    }
  }, 45_000);
});
