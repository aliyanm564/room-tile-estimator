// Models we allow, and prices for the cost ESTIMATE we log. Billing is authoritative, not this file.
//
// Pricing source: https://platform.claude.com/docs/en/about-claude/pricing
// Values taken from Anthropic's model table as cached on 2026-11-03; entered 2026-11-23.
// NOT yet checked against the live pricing page — verify before relying on cost numbers.

export const MODELS = {
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    effort: "high",
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
  },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    effort: "high",
    // Prompts up to 100K input tokens; longer prompts are billed at $0.50 / $2.50.
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    longPrompt: { aboveInputTokens: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
  },
} as const satisfies Record<string, ModelSpec>;

interface ModelSpec {
  label: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  inputPerMTok: number;
  outputPerMTok: number;
  longPrompt?: { aboveInputTokens: number; inputPerMTok: number; outputPerMTok: number };
}

export type ModelId = keyof typeof MODELS;

export const DEFAULT_MODEL: ModelId = "claude-sonnet-5-5";

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

export function isModelId(s: string): s is ModelId {
  return Object.hasOwn(MODELS, s);
}

/**
 * Estimated USD cost. `inputTokens` should include cache reads/writes (we don't use caching yet,
 * so they're priced at the normal input rate — a slight overestimate if caching is ever on).
 * Thinking tokens are part of `outputTokens` and billed as output.
 */
export function estimateCostUsd(model: ModelId, inputTokens: number, outputTokens: number): number {
  const spec: ModelSpec = MODELS[model];
  const rates =
    spec.longPrompt && inputTokens > spec.longPrompt.aboveInputTokens ? spec.longPrompt : spec;
  return (inputTokens * rates.inputPerMTok + outputTokens * rates.outputPerMTok) / 1_000_000;
}
