export type LiveRetryOptions = {
  attempts?: number;
  delayMs?: number;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 1_000;

export function isTransientLiveError(error: unknown): boolean {
  const message = String(
    (error as { message?: string })?.message ?? error,
  ).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("rate-limit") ||
    message.includes("503") ||
    message.includes("temporarily unavailable") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network error")
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function withLiveRetry<T>(
  operation: () => Promise<T>,
  options: LiveRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  if (attempts < 1) {
    throw new Error("withLiveRetry requires at least one attempt");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const shouldRetry =
        attempt < attempts && isTransientLiveError(error);

      if (!shouldRetry) {
        throw error;
      }

      await wait(delayMs * attempt);
    }
  }

  throw lastError;
}