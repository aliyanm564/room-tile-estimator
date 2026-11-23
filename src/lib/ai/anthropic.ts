// Anthropic (Claude) implementation of RoomAnalyzer. Server-side only.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ProcessedImage } from "@/lib/images/preprocess";
import { DEFAULT_MODEL, MODELS, estimateCostUsd, isModelId, type ModelId } from "./models";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildRetryMessage, buildUserContent } from "./prompt";
import { AnalysisError, buildRoomAnalysis, type AnalyzeOptions, type RoomAnalyzer } from "./provider";
import {
  ModelOutputSchema,
  validateModelOutput,
  type RoomAnalysis,
  type ValidationResult,
} from "./schema";

/** The slice of the SDK client we use. Lets tests inject a fake without touching the network. */
export interface MessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface AnthropicAnalyzerDeps {
  /** Inject a client (tests). If omitted, a real SDK client is built from ANTHROPIC_API_KEY. */
  client?: MessagesClient;
  env?: Record<string, string | undefined>;
  /** Extra SDK client options (tests pass a fake `fetch` to exercise the real SDK's retries). */
  sdkOptions?: Pick<NonNullable<ConstructorParameters<typeof Anthropic>[0]>, "fetch" | "baseURL">;
  log?: (line: string) => void;
  now?: () => number;
}

/** Generous: up to 6 photos with adaptive thinking at high effort can take a minute or more. */
export const REQUEST_TIMEOUT_MS = 180_000;
/** SDK-level retries (with backoff) for 408/409/429/5xx/529-overloaded and connection errors. */
export const SDK_MAX_RETRIES = 1;
const MAX_OUTPUT_TOKENS = 16_000;
/** One retry with the validation errors, so at most 2 attempts. */
const MAX_ATTEMPTS = 2;

const OUTPUT_FORMAT = zodOutputFormat(ModelOutputSchema);

export function resolveModel(requested: string | undefined, env: Record<string, string | undefined>): ModelId {
  const m = requested ?? env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  if (!isModelId(m)) {
    throw new AnalysisError(
      "unknown_model",
      "Photo analysis is misconfigured on the server.",
      500,
      `Unknown model "${m}". Allowed: ${Object.keys(MODELS).join(", ")}`,
    );
  }
  return m;
}

function buildClient(
  env: Record<string, string | undefined>,
  sdkOptions: AnthropicAnalyzerDeps["sdkOptions"] = {},
): MessagesClient {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AnalysisError(
      "missing_api_key",
      "Photo analysis isn't set up on this server yet.",
      503,
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local, add your key, and restart the server.",
    );
  }
  const client = new Anthropic({
    ...sdkOptions,
    apiKey,
    maxRetries: SDK_MAX_RETRIES,
    timeout: REQUEST_TIMEOUT_MS,
  });
  return { messages: { create: (params) => client.messages.create(params) } };
}

/** Map SDK errors to friendly AnalysisErrors. Raw SDK messages go to `message` (logs) only. */
export function toAnalysisError(e: unknown): AnalysisError {
  if (e instanceof AnalysisError) return e;
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError("auth_failed", "Photo analysis isn't available right now (server key problem).", 503, detail);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AnalysisError("rate_limited", "The photo analyzer is busy. Please try again in a minute.", 429, detail);
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new AnalysisError("timeout", "Analyzing the photos took too long. Please try again, maybe with fewer photos.", 504, detail);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new AnalysisError("connection_failed", "Couldn't reach the photo analyzer. Check the server's internet connection and try again.", 503, detail);
  }
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) {
    return new AnalysisError("ai_unavailable", "The photo analyzer is temporarily unavailable. Please try again in a few minutes.", 503, detail);
  }
  return new AnalysisError("ai_failed", "Something went wrong analyzing the photos. Please try again.", 502, detail);
}

export function createAnthropicAnalyzer(deps: AnthropicAnalyzerDeps = {}): RoomAnalyzer {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.info(line));
  const now = deps.now ?? (() => Date.now());
  let client = deps.client;

  return {
    async analyzeRoom(images: ProcessedImage[], options: AnalyzeOptions = {}): Promise<RoomAnalysis> {
      const model = resolveModel(options.model, env);
      client ??= buildClient(env, deps.sdkOptions);
      const started = now();

      const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserContent(images, options) }];
      let inputTokens = 0;
      let outputTokens = 0;

      const logUsage = (attempts: number, outcome: string) => {
        const cost = estimateCostUsd(model, inputTokens, outputTokens);
        log(
          `[ai] ${outcome} model=${model} prompt=${PROMPT_VERSION} photos=${images.length} attempts=${attempts} ` +
            `in=${inputTokens} out=${outputTokens} est=$${cost.toFixed(4)} ${now() - started}ms`,
        );
        return cost;
      };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let response: Anthropic.Message;
        try {
          // No `thinking` param: both models run adaptive thinking by default. No `fallbacks`:
          // results must come from the requested model.
          response = await client.messages.create({
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: SYSTEM_PROMPT,
            messages,
            output_config: { effort: MODELS[model].effort, format: OUTPUT_FORMAT },
          });
        } catch (e) {
          const err = toAnalysisError(e);
          logUsage(attempt, `error(${err.code})`);
          log(`[ai] ${err.message}`);
          throw err;
        }

        const u = response.usage;
        inputTokens += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        outputTokens += u.output_tokens;

        if (response.stop_reason === "refusal") {
          logUsage(attempt, "refused");
          throw new AnalysisError(
            "refused",
            "The photo analyzer couldn't process these photos. Try different photos of the room.",
            422,
            `Model refused (category: ${response.stop_details?.category ?? "none"})`,
          );
        }

        let errors: string[];
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (response.stop_reason === "max_tokens") {
          errors = ["(root): the response was cut off before the JSON was complete; keep notes and messages short"];
        } else {
          let raw: unknown;
          try {
            raw = JSON.parse(text);
          } catch {
            raw = undefined;
          }
          const result: ValidationResult =
            raw === undefined
              ? { success: false, errors: ["(root): response was not valid JSON"] }
              : validateModelOutput(raw, images.length);
          if (result.success) {
            const estimatedCostUsd = logUsage(attempt, "ok");
            return buildRoomAnalysis(images, result.data, {
              model,
              promptVersion: PROMPT_VERSION,
              inputTokens,
              outputTokens,
              estimatedCostUsd,
              durationMs: now() - started,
              attempts: attempt,
            });
          }
          errors = result.errors;
        }

        log(`[ai] attempt ${attempt} failed validation: ${errors.join("; ")}`);
        if (attempt === MAX_ATTEMPTS) {
          logUsage(attempt, "invalid_output");
          throw new AnalysisError(
            "invalid_output",
            "The photo analyzer returned a result we couldn't use. Please try again.",
            502,
            `Output failed validation twice: ${errors.join("; ")}`,
          );
        }
        // Pass the assistant turn back unchanged (thinking blocks included), then the errors.
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: buildRetryMessage(errors) });
      }
      throw new Error("unreachable");
    },
  };
}
