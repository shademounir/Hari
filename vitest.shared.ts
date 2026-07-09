import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";

// Shared by vitest.config.ts (deterministic) and vitest.live.config.ts (live)
// so the two can't drift; each adds only its own include/exclude + timeout.
export const plugins = [tsconfigPaths()];

// `server-only` / `client-only` throw when imported outside a React Server/Client
// bundle (Vitest runs in plain node), which would break importing any server
// module (e.g. lib/predictive/*) into a test. Alias them to a no-op stub for
// tests; the real guard still applies during `next build`.
const emptyModule = fileURLToPath(new URL("./tests/stubs/empty-module.ts", import.meta.url));
export const resolve = {
  alias: {
    "server-only": emptyModule,
    "client-only": emptyModule,
  },
};

export const sharedTest = {
  environment: "node" as const,
  setupFiles: ["./tests/setup.ts"],
  // Integration tests touch a single shared DB — run serially.
  fileParallelism: false,
};
