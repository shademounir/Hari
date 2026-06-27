import { defineConfig } from "vitest/config";
import { plugins, sharedTest } from "./vitest.shared";

// Live suite (`npm run test:live`): real OpenRouter calls + pgvector RAG, kept
// out of `npm test`. Self-skips without OPENROUTER_API_KEY, so it's safe to run
// in a keyless CI. Full split documented in the README "Testing" section.
export default defineConfig({
  plugins,
  test: {
    ...sharedTest,
    testTimeout: 45_000,
    include: ["tests/**/*.live.test.ts"],
  },
});
