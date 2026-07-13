import { describe, expect, it, vi } from "vitest";

import {
  isTransientLiveError,
  withLiveRetry,
} from "./helpers/live-retry";

describe("live retry helper", () => {
  it("retries a transient error and eventually succeeds", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("ok");

    const result = await withLiveRetry(operation, {
      attempts: 2,
      delayMs: 0,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries timeout and network errors", async () => {
    expect(isTransientLiveError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientLiveError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientLiveError(new Error("socket hang up"))).toBe(true);
    expect(isTransientLiveError(new Error("503 Service Unavailable"))).toBe(
      true,
    );
  });

  it("does not retry a permanent error", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("Invalid API key"));

    await expect(
      withLiveRetry(operation, {
        attempts: 3,
        delayMs: 0,
      }),
    ).rejects.toThrow("Invalid API key");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("stops after the configured number of attempts", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("429 rate limit"));

    await expect(
      withLiveRetry(operation, {
        attempts: 3,
        delayMs: 0,
      }),
    ).rejects.toThrow("429 rate limit");

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("rejects an invalid attempts value", async () => {
    await expect(
      withLiveRetry(async () => "ok", {
        attempts: 0,
        delayMs: 0,
      }),
    ).rejects.toThrow("withLiveRetry requires at least one attempt");
  });
});