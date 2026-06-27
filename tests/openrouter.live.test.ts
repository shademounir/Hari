import { describe, it, expect } from "vitest";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getChatModel } from "@/lib/ai/providers";

// Live smoke test against OpenRouter. Skips automatically if no key is set.
const hasKey = !!process.env.OPENROUTER_API_KEY;
const d = hasKey ? describe : describe.skip;

d("OpenRouter (live)", () => {
  it("generates text with the default model", async () => {
    const { text } = await generateText({
      model: getChatModel("gpt-oss-120b"),
      prompt: "Reply with exactly the word: pong",
    });
    expect(text.toLowerCase()).toContain("pong");
  }, 30_000);

  it("calls a tool and uses its result (multi-step)", async () => {
    let called = false;
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
  }, 45_000);
});
