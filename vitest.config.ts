import { defineConfig, configDefaults } from "vitest/config";
import { plugins, sharedTest } from "./vitest.shared";

// Deterministic suite (`npm test`). Live OpenRouter suites (`*.live.test.ts`)
// are excluded so the default run can't flake on the network; run them with
// `npm run test:live`. Full split documented in the README "Testing" section.
export default defineConfig({
  plugins,
  test: {
    ...sharedTest,
    testTimeout: 30_000,
    exclude: [...configDefaults.exclude, "**/*.live.test.ts"],
  },
});
