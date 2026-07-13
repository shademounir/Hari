// Route-level test for POST /api/chat — verifies the auth gate documented in
// docs/06-tests/tests.md ("no client-side authorization"): an unauthenticated
// request must be rejected by the server before any model/tool code runs.
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const streamTextMock = vi.fn();
vi.mock("ai", () => ({
  streamText: streamTextMock,
  convertToModelMessages: vi.fn(async (messages) => messages),
  stepCountIs: vi.fn(() => () => false),
  hasToolCall: vi.fn(() => () => false),
  createUIMessageStream: vi.fn(() => ({})),
  createUIMessageStreamResponse: vi.fn(() => new Response("ok", { status: 200 })),
}));

const getChatModelMock = vi.fn(() => "mock-model");
vi.mock("@/lib/ai/providers", () => ({
  getChatModel: getChatModelMock,
  // Only an OpenRouter model is "available" in the test env (no gateway key).
  getAvailableChatModels: vi.fn(() => [{ id: "gpt-oss-120b", provider: "openrouter" }]),
  CHAT_ERROR_CODES: ["auth_missing", "rate_limited", "model_unavailable", "session_expired", "network", "generic"],
}));

vi.mock("@/lib/ai/tools", () => ({
  buildHrTools: vi.fn(() => ({})),
}));

// The route resolves the active locale + org currency/timezone for the prompt.
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "en") }));
vi.mock("@/lib/settings", () => ({
  getOrgSettings: vi.fn(async () => ({ currency: "MAD", timezone: "UTC" })),
}));

beforeEach(() => {
  authMock.mockReset();
  streamTextMock.mockReset();
  getChatModelMock.mockClear();
});

describe("POST /api/chat", () => {
  it("rejects an unauthenticated request with 401, before touching the model", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/chat/route");

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(res.status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("streams a response for an authenticated session, scoped to the caller's role", async () => {
    authMock.mockResolvedValue({
      user: { role: "EMPLOYEE", employeeId: "emp-1", name: "Ada" },
    });
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok", { status: 200 }),
    });

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledOnce();
    const callArgs = streamTextMock.mock.calls[0][0];
    expect(callArgs.system).toContain("Ada");
    expect(callArgs.system).toContain("Employee");
  });

  it("falls back to the default model when the requested modelKey isn't available in this env", async () => {
    authMock.mockResolvedValue({ user: { role: "EMPLOYEE", employeeId: "emp-1", name: "Ada" } });
    streamTextMock.mockReturnValue({ toUIMessageStreamResponse: () => new Response("ok", { status: 200 }) });

    const { POST } = await import("@/app/api/chat/route");
    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        // gpt-4o-mini is a gateway model — NOT in the mocked available list.
        body: JSON.stringify({ messages: [], modelKey: "gpt-4o-mini" }),
      }),
    );
    // Resolver must drop the unavailable id (→ undefined) so getChatModel defaults,
    // instead of routing to a gateway provider that would throw.
    expect(getChatModelMock).toHaveBeenCalledWith(undefined);
  });

  it("returns the session_expired code (not 'Unauthorized') on an expired session", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [] }) }),
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("session_expired");
  });
});

describe("chatErrorCode — classification order", () => {
  it("ranks rate-limit and model-unavailable ABOVE auth when text overlaps", async () => {
    const { chatErrorCode } = await import("@/app/api/chat/route");
    // A 429 whose body also mentions 'unauthorized' must be rate_limited, not auth.
    expect(chatErrorCode(new Error("429 rate limited; unauthorized key note"))).toBe("rate_limited");
    expect(chatErrorCode(new Error("402 payment required — insufficient credits"))).toBe("rate_limited");
    expect(chatErrorCode(new Error("404 no endpoints found for model"))).toBe("model_unavailable");
    expect(chatErrorCode(new Error("OPENROUTER_API_KEY is not set"))).toBe("auth_missing");
    expect(chatErrorCode(new Error("403 forbidden: model not entitled"))).toBe("auth_missing");
    // Transport failures classify as network (distinct, more actionable than generic).
    expect(chatErrorCode(new Error("socket hang up"))).toBe("network");
    expect(chatErrorCode(new Error("502 bad gateway"))).toBe("network");
    // Truly unclassifiable → generic.
    expect(chatErrorCode(new Error("something odd happened"))).toBe("generic");
  });
});
