import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicAnalyzer, type MessagesClient } from "@/lib/ai/anthropic";
import { DEFAULT_PROMPT_ID, LATEST_PROMPT_VERSION, PROMPTS, PROMPT_IDS, PROMPT_VERSION, getPrompt, isPromptId } from "@/lib/ai/prompt";
import { AnalysisError } from "@/lib/ai/provider";
import { fakeProcessed, validOutput } from "../helpers/images";

const msg = (text: string) =>
  ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1000, output_tokens: 200 },
  }) as unknown as Anthropic.Message;

describe("prompt registry", () => {
  it("serves v2 and v3 by ID, each with its own version", () => {
    expect(PROMPT_IDS).toEqual(["v2", "v3"]);
    expect(getPrompt("v2").version).toBe("2026-11-23.2");
    expect(getPrompt("v3").version).toBe("2026-11-23.3");
    expect(LATEST_PROMPT_VERSION).toBe("2026-11-23.3");
    expect(isPromptId("v3")).toBe(true);
    expect(isPromptId("v9")).toBe(false);
  });

  it("default is v3 (switched after the 2026-11-23 eval); v2 stays runnable", () => {
    expect(DEFAULT_PROMPT_ID).toBe("v3");
    expect(PROMPT_VERSION).toBe(PROMPTS.v3.version);
  });

  it("v3 differs from v2 ONLY in the notes rule", () => {
    const v2 = PROMPTS.v2.system.split("\n");
    const v3 = PROMPTS.v3.system.split("\n");
    const v2NotesAt = v2.findIndex((l) => l.startsWith("- notes:"));
    const v3NotesAt = v3.findIndex((l) => l.startsWith("- notes:"));
    expect(v2NotesAt).toBe(v3NotesAt);
    expect(v3.slice(0, v3NotesAt)).toEqual(v2.slice(0, v2NotesAt)); // everything before: identical
    const v2After = v2.slice(v2NotesAt + 1);
    expect(v3.slice(v3.length - v2After.length)).toEqual(v2After); // everything after: identical
    const v3Notes = v3.slice(v3NotesAt, v3.length - v2After.length).join("\n");
    expect(v3Notes).toMatch(/never first person/);
    expect(v3Notes).toMatch(/Only suggest actions the app supports/);
    expect(v3Notes).toMatch(/Never suggest measuring closets/);
  });

  it("the analyzer uses the requested prompt and records it in meta", async () => {
    const create = vi.fn<MessagesClient["messages"]["create"]>().mockResolvedValue(msg(JSON.stringify(validOutput())));
    const analyzer = createAnthropicAnalyzer({ client: { messages: { create } }, env: { ANTHROPIC_API_KEY: "k" }, log: () => {} });

    const def = await analyzer.analyzeRoom([fakeProcessed()]);
    const v3 = await analyzer.analyzeRoom([fakeProcessed()], { promptId: "v3" });
    const v2 = await analyzer.analyzeRoom([fakeProcessed()], { promptId: "v2" });
    expect(create.mock.calls[2][0].system).toBe(PROMPTS.v2.system);
    expect([v2.meta.promptId, v2.meta.promptVersion]).toEqual(["v2", "2026-11-23.2"]);

    expect(create.mock.calls[0][0].system).toBe(PROMPTS.v3.system); // default
    expect(create.mock.calls[1][0].system).toBe(PROMPTS.v3.system);
    expect([def.meta.promptId, def.meta.promptVersion]).toEqual(["v3", "2026-11-23.3"]);
    expect([v3.meta.promptId, v3.meta.promptVersion]).toEqual(["v3", "2026-11-23.3"]);
  });

  it("failed analyses carry what they spent (for the eval's cost cap)", async () => {
    const create = vi.fn<MessagesClient["messages"]["create"]>().mockResolvedValue(msg("not json"));
    const analyzer = createAnthropicAnalyzer({ client: { messages: { create } }, env: { ANTHROPIC_API_KEY: "k" }, log: () => {} });
    const err = await analyzer.analyzeRoom([fakeProcessed()]).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err.spend).toMatchObject({ inputTokens: 2000, outputTokens: 400 });
    expect(err.spend.estimatedCostUsd).toBeCloseTo((2000 * 2 + 400 * 10) / 1e6, 12);
  });
});
