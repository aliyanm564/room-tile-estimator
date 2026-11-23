import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicAnalyzer, toAnalysisError, type MessagesClient } from "@/lib/ai/anthropic";
import { estimateCostUsd } from "@/lib/ai/models";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserContent } from "@/lib/ai/prompt";
import { AnalysisError } from "@/lib/ai/provider";
import type { ModelOutput } from "@/lib/ai/schema";
import { fakeProcessed, validOutput } from "../helpers/images";

const KEY_ENV = { ANTHROPIC_API_KEY: "test-key" };

function message(
  text: string,
  { stop = "end_turn", inTok = 1000, outTok = 500 }: { stop?: Anthropic.StopReason; inTok?: number; outTok?: number } = {},
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: inTok, output_tokens: outTok },
  } as unknown as Anthropic.Message;
}

const json = (o: ModelOutput | object) => message(JSON.stringify(o));

function fakeClient(...responses: (Anthropic.Message | Error)[]) {
  const create = vi.fn<MessagesClient["messages"]["create"]>();
  for (const r of responses) {
    if (r instanceof Error) create.mockRejectedValueOnce(r);
    else create.mockResolvedValueOnce(r);
  }
  return { client: { messages: { create } }, create };
}

const quiet = () => {};

describe("Anthropic analyzer", () => {
  it("sends the prompt, images and structured-output format; returns a validated analysis", async () => {
    const { client, create } = fakeClient(json(validOutput()));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });
    const images = [fakeProcessed("standard", "a.jpg"), fakeProcessed("ultra_wide", "b.jpg")];

    const result = await analyzer.analyzeRoom(images, {
      roomName: "Main bedroom",
      knownMeasurement: { valueFt: 14, which: "longest" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.system).toBe(SYSTEM_PROMPT);
    expect(params.output_config?.effort).toBe("high");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("thinking");
    const content = params.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content.filter((b) => b.type === "image")).toHaveLength(2);
    const texts = content.filter((b): b is Anthropic.TextBlockParam => b.type === "text").map((b) => b.text);
    expect(texts[0]).toMatch(/^Photo 1 of 2 — standard lens \(1x, 26mm/);
    expect(texts[1]).toMatch(/^Photo 2 of 2 — ultra-wide lens \(0\.5x/);
    expect(texts.at(-1)).toMatch(/Main bedroom[\s\S]*14 ft — the room's longest floor dimension/);

    expect(result.roomType).toBe("bedroom");
    expect(result.photos.map((p) => [p.index, p.name, p.lens])).toEqual([
      [1, "a.jpg", "standard"],
      [2, "b.jpg", "ultra_wide"],
    ]);
    expect(result.meta).toMatchObject({
      model: "claude-sonnet-5-5",
      promptVersion: PROMPT_VERSION,
      inputTokens: 1000,
      outputTokens: 500,
      attempts: 1,
    });
    expect(result.meta.estimatedCostUsd).toBeCloseTo(estimateCostUsd("claude-sonnet-5-5", 1000, 500), 12);
  });

  it("adds a deterministic ultra_wide_lens issue from OUR code, before the model's issues", async () => {
    const modelIssue = { code: "blurry" as const, message: "Photo 1 is a bit blurry.", photoIndex: 1 };
    const { client } = fakeClient(json(validOutput({ issues: [modelIssue] })));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });
    const result = await analyzer.analyzeRoom([fakeProcessed("standard"), fakeProcessed("ultra_wide"), fakeProcessed("unknown")]);
    expect(result.issues).toEqual([
      {
        code: "ultra_wide_lens",
        message: expect.stringMatching(/^Photo 2 was taken with the 0\.5x.*retake it at 1x\.$/),
        photoIndex: 2,
        source: "app",
      },
      { ...modelIssue, source: "model" },
    ]);
  });

  it("no ultra-wide photos (incl. unknown lens) → no lens warning", async () => {
    const { client } = fakeClient(json(validOutput()));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });
    const result = await analyzer.analyzeRoom([fakeProcessed("standard"), fakeProcessed("unknown"), fakeProcessed("telephoto")]);
    expect(result.issues).toEqual([]);
  });

  it("invalid output triggers exactly one retry that includes the validation error", async () => {
    const bad = validOutput({ sections: [{ lengthFt: { low: 13, likely: 12, high: 11 }, widthFt: { low: 9, likely: 10, high: 11 } }] });
    const { client, create } = fakeClient(message(JSON.stringify(bad), { inTok: 1000, outTok: 400 }), message(JSON.stringify(validOutput()), { inTok: 1500, outTok: 300 }));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });

    const result = await analyzer.analyzeRoom([fakeProcessed()]);

    expect(create).toHaveBeenCalledTimes(2);
    const retry = create.mock.calls[1][0].messages;
    expect(retry).toHaveLength(3);
    expect(retry[1].role).toBe("assistant");
    expect(retry[2]).toMatchObject({ role: "user" });
    expect(retry[2].content).toMatch(/sections\.0\.lengthFt: must satisfy low ≤ likely ≤ high/);
    expect(result.meta).toMatchObject({ attempts: 2, inputTokens: 2500, outputTokens: 700 });
  });

  it("invalid twice → friendly error, no third attempt", async () => {
    const { client, create } = fakeClient(message("not json"), message('{"usable": true}'));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });
    const err = await analyzer.analyzeRoom([fakeProcessed()]).catch((e) => e);
    expect(create).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err).toMatchObject({ code: "invalid_output", status: 502 });
    expect(err.userMessage).not.toMatch(/json|schema|zod/i);
  });

  it("output cut off at max_tokens is treated as invalid and retried once", async () => {
    const { client, create } = fakeClient(message('{"usable": tr', { stop: "max_tokens" }), json(validOutput()));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });
    await analyzer.analyzeRoom([fakeProcessed()]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[2].content).toMatch(/cut off/);
  });

  it("refusal → friendly error, no retry, no fallback model", async () => {
    const { client, create } = fakeClient(message("", { stop: "refusal" }));
    const analyzer = createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet });
    const err = await analyzer.analyzeRoom([fakeProcessed()]).catch((e) => e);
    expect(create).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ code: "refused", status: 422 });
  });

  it("missing ANTHROPIC_API_KEY → clear error, before any request", async () => {
    const analyzer = createAnthropicAnalyzer({ env: {}, log: quiet });
    const err = await analyzer.analyzeRoom([fakeProcessed()]).catch((e) => e);
    expect(err).toMatchObject({ code: "missing_api_key", status: 503 });
    expect(err.message).toMatch(/ANTHROPIC_API_KEY is not set.*\.env\.local/);
    expect(err.userMessage).not.toMatch(/ANTHROPIC/);
  });

  it("model can be chosen per call (Haiku) or via ANTHROPIC_MODEL; unknown models rejected", async () => {
    const { client, create } = fakeClient(json(validOutput()), json(validOutput()));
    await createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet }).analyzeRoom([fakeProcessed()], { model: "claude-haiku-5-5" });
    await createAnthropicAnalyzer({ client, env: { ...KEY_ENV, ANTHROPIC_MODEL: "claude-haiku-5-5" }, log: quiet }).analyzeRoom([fakeProcessed()]);
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);

    const err = await createAnthropicAnalyzer({ client, env: { ...KEY_ENV, ANTHROPIC_MODEL: "gpt-9" }, log: quiet })
      .analyzeRoom([fakeProcessed()])
      .catch((e) => e);
    expect(err).toMatchObject({ code: "unknown_model" });
  });

  it("logs token usage and estimated cost", async () => {
    const lines: string[] = [];
    const { client } = fakeClient(json(validOutput()));
    await createAnthropicAnalyzer({ client, env: KEY_ENV, log: (l) => lines.push(l) }).analyzeRoom([fakeProcessed()]);
    expect(lines.join("\n")).toMatch(/\[ai\] ok model=claude-sonnet-5-5 .*in=1000 out=500 est=\$0\.0070/);
  });

  it("SDK errors become friendly errors; raw SDK text never reaches userMessage", async () => {
    const headers = new Headers();
    const cases: [Error, string, number][] = [
      [new Anthropic.RateLimitError(429, { error: { message: "rate limit: org abc" } }, "rate limit: org abc", headers), "rate_limited", 429],
      [new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key sk-ant-xyz", headers), "auth_failed", 503],
      [new Anthropic.InternalServerError(529, undefined, "Overloaded", headers), "ai_unavailable", 503],
      [new Anthropic.APIConnectionTimeoutError(), "timeout", 504],
      [new Anthropic.BadRequestError(400, undefined, "messages.0: image too large", headers), "ai_failed", 502],
    ];
    for (const [sdkErr, code, status] of cases) {
      const { client } = fakeClient(sdkErr);
      const err = await createAnthropicAnalyzer({ client, env: KEY_ENV, log: quiet }).analyzeRoom([fakeProcessed()]).catch((e) => e);
      expect(err).toMatchObject({ code, status });
      expect(err.userMessage).not.toMatch(/sk-ant|org abc|x-api-key|image too large|Overloaded/);
    }
    expect(toAnalysisError(new Error("boom")).code).toBe("ai_failed");
  });

  it("prompt never asks for prices or quantities, and labels known-measurement 'unknown' correctly", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never estimate prices, costs, number of boxes/);
    const last = buildUserContent([fakeProcessed()], { knownMeasurement: { valueFt: 10, which: "unknown" } }).at(-1);
    expect(last).toMatchObject({ type: "text", text: expect.stringMatching(/10 ft — one wall, which one is not specified/) });
  });
});
