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
}));

vi.mock("@/lib/ai/providers", () => ({
  getChatModel: vi.fn(() => "mock-model"),
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
});
