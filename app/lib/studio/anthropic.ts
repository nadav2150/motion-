// callOpus(): the single entry point for every Studio (v2) Claude call.
//
//   • Model claude-opus-5-5, adaptive thinking (always on; never send
//     budget_tokens or "disabled"), effort set explicitly per call.
//   • Streams (`beta.messages.stream().finalMessage()`) — code calls produce
//     tens of thousands of output tokens.
//   • Server-side refusal fallback on by default: beta header
//     server-side-fallback-2026-07-01 + `fallbacks: "default"`. The installed
//     SDK (0.96) predates the `fallbacks` body param, so it is passed through
//     a typed extension of the params object (the SDK forwards unknown body
//     keys verbatim). Metering uses `response.model`, which is the model that
//     actually answered.
//   • Prompt caching: callers pass system blocks with `cache: true`; those get
//     `cache_control: {type:"ephemeral"}`. The big stable craft prompt +
//     library docs block is byte-identical across every Studio call.
//   • Metering via recordModelCost (reason opus_studio_*), and a per-operation
//     token budget on the ambient meter context (250k weighted tokens by
//     default, STUDIO_TOKEN_CAP to override).
//   • One extra retry on 529 / overloaded_error (the SDK already retries the
//     initial request; this covers overloads surfacing mid-stream).
//   • stop_reason "refusal" is checked before reading any content.

import type Anthropic from "@anthropic-ai/sdk";
import { getClient } from "../hyperframes/llm-director";
import { canonicalClaudeModel } from "../llm-provider";
import type { ConsumptionReason } from "../billing/credits";
import {
  creditsForAnthropic,
  getMeterContext,
  usdMicrosForAnthropic,
  weightedTokens,
  type TokenBudget,
} from "../billing/meter";
import { recordModelCost } from "../billing/track-cost";

export const STUDIO_MODEL = "claude-opus-5-5";
export const STUDIO_TOKEN_CAP = Number(process.env.STUDIO_TOKEN_CAP) || 250_000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const REQUEST_TIMEOUT_MS = 20 * 60 * 1000;
const OVERLOAD_RETRY_DELAY_MS = 4_000;

export type OpusEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type SystemBlock = { text: string; cache?: boolean };

export type ImageInput = { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

// Minimal message shape the pipeline needs: text and base64 images.
export type OpusContent =
  | { type: "text"; text: string; cache?: boolean }
  | { type: "image"; image: ImageInput };

export type OpusMessage = { role: "user" | "assistant"; content: string | OpusContent[] };

export type CallOpusArgs = {
  system: SystemBlock[];
  messages: OpusMessage[];
  schema?: Record<string, unknown>; // JSON schema → output_config.format
  effort: OpusEffort;
  maxTokens: number;
  reason: ConsumptionReason;
  label?: string; // log prefix
  stream?: true; // always streamed; kept for call-site readability
};

export type OpusUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export type CallOpusResult<T = unknown> = {
  text: string;
  json: T | undefined;
  model: string;
  stopReason: string | null;
  usage: OpusUsage;
};

export class StudioRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(
      "The AI declined to make this video. Try rephrasing the request" +
        (category ? ` (policy: ${category}).` : "."),
    );
    this.name = "StudioRefusalError";
  }
}

export class TokenBudgetExceededError extends Error {
  constructor(public readonly used: number, public readonly cap: number) {
    super(`Studio token budget exhausted (${used} of ${cap} tokens used).`);
    this.name = "TokenBudgetExceededError";
  }
}

export class TruncatedOutputError extends Error {
  constructor(label: string, outputTokens: number) {
    super(`${label}: output hit max_tokens after ${outputTokens} tokens.`);
    this.name = "TruncatedOutputError";
  }
}

/** Fresh budget for one Studio operation (generation, edit, regenerate). */
export function newTokenBudget(cap = STUDIO_TOKEN_CAP): TokenBudget {
  return { used: 0, cap };
}

export function remainingBudget(): number {
  const b = getMeterContext().tokenBudget;
  return b ? b.cap - b.used : Infinity;
}

// ─── Request building (pure, exported for tests) ───────────────────────────

type BetaCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
// `fallbacks` is newer than the installed SDK's types; see header comment.
export type StudioRequestParams = BetaCreateParams & { fallbacks?: "default" };

export function buildRequest(args: CallOpusArgs): StudioRequestParams {
  const system = args.system.map((b) => ({
    type: "text" as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
  const messages = args.messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((c) =>
            c.type === "text"
              ? {
                  type: "text" as const,
                  text: c.text,
                  ...(c.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
                }
              : {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: c.image.mediaType, data: c.image.data },
                },
          ),
  }));
  return {
    model: STUDIO_MODEL,
    max_tokens: args.maxTokens,
    system,
    messages,
    thinking: { type: "adaptive" },
    output_config: {
      effort: args.effort,
      ...(args.schema ? { format: { type: "json_schema" as const, schema: args.schema } } : {}),
    },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
  } as StudioRequestParams;
}

function isOverloaded(err: unknown): boolean {
  const e = err as { status?: number; error?: { type?: string; error?: { type?: string } }; message?: string };
  if (e?.status === 529) return true;
  const t = e?.error?.type === "error" ? e.error.error?.type : e?.error?.type;
  if (t === "overloaded_error") return true;
  return typeof e?.message === "string" && /overloaded/i.test(e.message);
}

type StreamFn = (params: StudioRequestParams) => Promise<Anthropic.Beta.Messages.BetaMessage>;

const defaultStream: StreamFn = (params) =>
  getClient()
    .beta.messages.stream(params as unknown as Parameters<Anthropic["beta"]["messages"]["stream"]>[0], {
      timeout: REQUEST_TIMEOUT_MS,
    })
    .finalMessage();

let streamImpl: StreamFn = defaultStream;

/** Test hook: replace the network call. Pass null to restore. */
export function __setStreamImpl(fn: StreamFn | null): void {
  streamImpl = fn ?? defaultStream;
}

// ─── The call ──────────────────────────────────────────────────────────────

export async function callOpus<T = unknown>(args: CallOpusArgs): Promise<CallOpusResult<T>> {
  const label = args.label ?? args.reason;
  const budget = getMeterContext().tokenBudget;
  if (budget && budget.used >= budget.cap) {
    throw new TokenBudgetExceededError(budget.used, budget.cap);
  }

  const params = buildRequest(args);
  const started = Date.now();
  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    response = await streamImpl(params);
  } catch (err) {
    if (!isOverloaded(err)) throw err;
    console.warn(`[studio ${label}] overloaded — retrying once in ${OVERLOAD_RETRY_DELAY_MS}ms`);
    await new Promise((r) => setTimeout(r, OVERLOAD_RETRY_DELAY_MS));
    response = await streamImpl(params);
  }
  const latencyMs = Date.now() - started;

  const usage: OpusUsage = {
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_creation_input_tokens: response.usage?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
  };
  const model = canonicalClaudeModel(response.model || STUDIO_MODEL);
  meterOpus(model, usage, args.reason, latencyMs, args.effort);
  if (budget) budget.used += weightedTokens(usage);

  console.log(
    `[studio ${label}] model=${model} stop=${response.stop_reason} effort=${args.effort} ` +
      `in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens} ` +
      `cache_write=${usage.cache_creation_input_tokens} ${(latencyMs / 1000).toFixed(1)}s` +
      (budget ? ` budget=${budget.used}/${budget.cap}` : ""),
  );

  // Refusal first: content of a refused response must not be used.
  if (response.stop_reason === "refusal") {
    const details = (response as { stop_details?: { category?: string | null } | null }).stop_details;
    throw new StudioRefusalError(details?.category ?? null);
  }

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  if (response.stop_reason === "max_tokens") {
    throw new TruncatedOutputError(label, usage.output_tokens);
  }

  let json: T | undefined;
  if (args.schema) {
    if (!text.trim()) throw new Error(`${label}: empty structured response (stop=${response.stop_reason}).`);
    try {
      json = JSON.parse(text) as T;
    } catch (err) {
      throw new Error(
        `${label}: JSON parse failed (${err instanceof Error ? err.message : err}); last 200 chars: ${text.slice(-200)}`,
      );
    }
  }

  return { text, json, model, stopReason: response.stop_reason, usage };
}

function meterOpus(
  model: string,
  usage: OpusUsage,
  reason: ConsumptionReason,
  latencyMs: number,
  effort: OpusEffort,
): void {
  const costUsdMicros = usdMicrosForAnthropic(model, usage);
  const credits = creditsForAnthropic(model, usage);
  if (credits <= 0) return;
  void recordModelCost({
    provider: "anthropic",
    model,
    reason,
    unitKind: "tokens",
    units: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens + usage.output_tokens,
    inputTokens: usage.input_tokens + usage.cache_creation_input_tokens,
    outputTokens: usage.output_tokens,
    costUsdMicros,
    creditsCharged: credits,
    latencyMs,
    extra: {
      cache_read: usage.cache_read_input_tokens,
      cache_create: usage.cache_creation_input_tokens,
      effort,
    },
  });
}

/** Pull one complete HTML document out of a raw model response. */
export function extractHtmlDocument(text: string): string | null {
  let s = text.trim();
  const fence = s.match(/```(?:html)?\s*\n([\s\S]*?)\n```/i);
  if (fence && /<html[\s>]/i.test(fence[1]!)) s = fence[1]!.trim();
  const startIdx = (() => {
    const doctype = s.search(/<!doctype html/i);
    if (doctype !== -1) return doctype;
    return s.search(/<html[\s>]/i);
  })();
  const endIdx = s.toLowerCase().lastIndexOf("</html>");
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  return s.slice(startIdx, endIdx + "</html>".length);
}
