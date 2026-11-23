// Uses the REAL SDK client (with our retry/timeout config), but a fake `fetch` — no network.
import { describe, expect, it, vi } from "vitest";
import { createAnthropicAnalyzer } from "@/lib/ai/anthropic";
import { fakeProcessed, validOutput } from "../helpers/images";

const okBody = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text: JSON.stringify(validOutput()) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const errBody = (type: string) => ({ type: "error", error: { type, message: `${type} details` } });

function analyzerWith(fetchImpl: typeof fetch) {
  return createAnthropicAnalyzer({
    env: { ANTHROPIC_API_KEY: "test-key" },
    sdkOptions: { fetch: fetchImpl, baseURL: "http://fake-anthropic.test" },
    log: () => {},
  });
}

describe("rate-limit / overloaded retry (real SDK, fake fetch)", () => {
  it("retries once on 429, then succeeds", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(429, errBody("rate_limit_error"), { "retry-after-ms": "1" }))
      .mockResolvedValueOnce(json(200, okBody));
    const result = await analyzerWith(f).analyzeRoom([fakeProcessed()]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(result.usable).toBe(true);
  });

  it("retries once on 529 overloaded, then gives a friendly error", async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => json(529, errBody("overloaded_error"), { "retry-after-ms": "1" }));
    const err = await analyzerWith(f).analyzeRoom([fakeProcessed()]).catch((e) => e);
    expect(f).toHaveBeenCalledTimes(2); // original + exactly one retry
    expect(err).toMatchObject({ code: "ai_unavailable", status: 503 });
  });

  it("does not retry a 400", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json(400, errBody("invalid_request_error")));
    const err = await analyzerWith(f).analyzeRoom([fakeProcessed()]).catch((e) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ code: "ai_failed" });
  });

  it("sends the key and the requested model to the API", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json(200, okBody));
    await analyzerWith(f).analyzeRoom([fakeProcessed()], { model: "claude-haiku-5-5" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("http://fake-anthropic.test/v1/messages");
    // SDK 1.x sends the API key as a bearer token.
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body)).model).toBe("claude-haiku-5-5");
  });
});
