import tsconfigPaths from "vite-tsconfig-paths";

// Shared by vitest.config.ts (deterministic) and vitest.live.config.ts (live)
// so the two can't drift; each adds only its own include/exclude + timeout.
export const plugins = [tsconfigPaths()];

export const sharedTest = {
  environment: "node" as const,
  setupFiles: ["./tests/setup.ts"],
  // Integration tests touch a single shared DB — run serially.
  fileParallelism: false,
};
