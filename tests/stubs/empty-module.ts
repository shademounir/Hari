// No-op stub aliased over `server-only` / `client-only` in the Vitest config.
// Those packages deliberately throw when imported outside a React Server/Client
// bundle (e.g. in Vitest's node environment), which would break importing any
// server module (`lib/predictive/*`) into a test. Aliasing them here neutralizes
// the guard for tests only — the real modules still enforce it at build time.
export {};
