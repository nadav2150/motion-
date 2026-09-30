// Per-provider/model USD price tables. Everything is expressed in MICROS
// (USD × 1,000,000) and stored / passed as integers — never floats — to avoid
// drift across thousands of calls.
//
// Numbers are pulled from each provider's public pricing page as of the
// migration date (2026-05-20). When a provider re-prices, update the table
// here — the meter() helpers and credit constants in meter.ts already
// reference these values indirectly through track-cost.ts.

const MICROS_PER_USD = 1_000_000;
const MICROS_PER_CENT = 10_000;

// ---------- Anthropic ----------
// Public Anthropic pricing, per 1M tokens ($X per 1M == X micros per token):
//   claude-opus-5-5   : $4  in, $20 out, cache read $0.20, cache write 1.25x in
//   claude-opus-4-8   : $15 in, $75 out
//   claude-opus-4-7   : $15 in, $75 out
//   claude-sonnet-4-6 : $3  in, $15 out
//
// response.usage.input_tokens counts only the UNCACHED input after the last
// cache breakpoint; cache_creation_input_tokens and cache_read_input_tokens
// are reported separately and billed at their own rates, so all three are
// priced here. When a model has no explicit cache rates, writes bill at 1.25x
// input and reads at 0.1x input (Anthropic's standard multipliers).
export type AnthropicPrice = {
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken?: number;
  cacheWritePerToken?: number;
};

export const ANTHROPIC_PRICE_TABLE: Record<string, AnthropicPrice> = {
  "claude-opus-5-5": { inputPerToken: 4, outputPerToken: 20, cacheReadPerToken: 0.2, cacheWritePerToken: 5 },
  "claude-opus-4-8": { inputPerToken: 15, outputPerToken: 75 },
  "claude-opus-4-7": { inputPerToken: 15, outputPerToken: 75 },
  "claude-sonnet-4-6": { inputPerToken: 3, outputPerToken: 15 },
};

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

// Shape of Anthropic's `response.usage`. All optional so partial objects
// (tests, older call sites) still price.
export type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

function anthropicPrice(rawModel: string): AnthropicPrice {
  // OpenRouter reports "anthropic/claude-opus-5.5"; the table uses "claude-opus-5-5".
  const model = rawModel.replace(/^anthropic\//, "").replace(/-(\d+)\.(\d+)$/, "-$1-$2");
  const exact = ANTHROPIC_PRICE_TABLE[model];
  if (exact) return exact;
  // Dated / suffixed ids ("claude-opus-5-5-20260801") → longest known prefix.
  const prefix = Object.keys(ANTHROPIC_PRICE_TABLE)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return ANTHROPIC_PRICE_TABLE[prefix]!;
  console.warn(`[pricing-usd] unknown Anthropic model "${model}" — defaulting to ${DEFAULT_ANTHROPIC_MODEL} pricing`);
  return ANTHROPIC_PRICE_TABLE[DEFAULT_ANTHROPIC_MODEL]!;
}

export function usdMicrosForAnthropic(model: string, usage: AnthropicUsageLike): number {
  const price = anthropicPrice(model);
  const cacheRead = price.cacheReadPerToken ?? price.inputPerToken * 0.1;
  const cacheWrite = price.cacheWritePerToken ?? price.inputPerToken * 1.25;
  const micros =
    (usage.input_tokens ?? 0) * price.inputPerToken +
    (usage.output_tokens ?? 0) * price.outputPerToken +
    (usage.cache_read_input_tokens ?? 0) * cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * cacheWrite;
  return Math.ceil(micros);
}

// ---------- Google Gemini ----------
// Per 1M tokens (micros per token). Video input is billed as input tokens
// (usageMetadata.promptTokenCount); thinking tokens (thoughtsTokenCount) bill
// at the output rate.
// gemini-3.5-flash: $1.50 in / $9.00 out per 1M — taken from third-party
// price trackers (OpenRouter / devtk.ai, 2026-09), not from Google's page
// directly. Re-check against ai.google.dev/gemini-api/docs/pricing.
export const GEMINI_PRICE_TABLE: Record<string, { inputPerToken: number; outputPerToken: number }> = {
  "gemini-3.5-flash": { inputPerToken: 1.5, outputPerToken: 9 },
  "gemini-2.5-flash": { inputPerToken: 0.3, outputPerToken: 2.5 },
  "gemini-2.5-pro": { inputPerToken: 1.25, outputPerToken: 10 },
};

export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

export function usdMicrosForGemini(model: string, usage: GeminiUsageMetadata): number {
  const price = GEMINI_PRICE_TABLE[model] ?? GEMINI_PRICE_TABLE["gemini-3.5-flash"]!;
  const input = usage.promptTokenCount ?? 0;
  const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return Math.ceil(input * price.inputPerToken + output * price.outputPerToken);
}

// ---------- ElevenLabs ----------
// ElevenLabs Creator-tier effective rates (per character, as of 2026-05-20):
//   eleven_multilingual_v2 : $0.30 / 1k chars
//   eleven_turbo_v2_5      : $0.15 / 1k chars
//   eleven_v3              : $0.40 / 1k chars (more expressive, higher tier)
// Converted to micros/char.
const ELEVENLABS_PRICE_PER_CHAR: Record<string, number> = {
  eleven_multilingual_v2: 300,
  eleven_turbo_v2_5: 150,
  eleven_v3: 400,
};

export function usdMicrosForElevenLabs(model: string, chars: number): number {
  const perChar = ELEVENLABS_PRICE_PER_CHAR[model] ?? ELEVENLABS_PRICE_PER_CHAR.eleven_multilingual_v2!;
  return Math.ceil(chars * perChar);
}

// ---------- Replicate (images) ----------
// Public Replicate per-run pricing (as of 2026-05-20). Stored in micros so
// adding new models is one line.
const REPLICATE_IMAGE_PRICE: Record<string, number> = {
  "ideogram-ai/ideogram-v3-quality": 8 * MICROS_PER_CENT,        // $0.08 / image
  "black-forest-labs/flux-1.1-pro-ultra": 6 * MICROS_PER_CENT,   // $0.06 / image
  "google/imagen-3": 5 * MICROS_PER_CENT,                        // $0.05 / image
  "google/nano-banana": 4 * MICROS_PER_CENT,                     // $0.04 / image
};

export function usdMicrosForReplicateImage(model: string): number {
  const price = REPLICATE_IMAGE_PRICE[model];
  if (price !== undefined) return price;
  console.warn(`[pricing-usd] unknown Replicate image model "${model}" — using Ideogram default`);
  return REPLICATE_IMAGE_PRICE["ideogram-ai/ideogram-v3-quality"]!;
}

// ---------- Replicate (video) ----------
// Per 5s clip pricing (as of 2026-05-20):
const REPLICATE_VIDEO_PRICE: Record<string, number> = {
  "kwaivgi/kling-v2.1-master": 50 * MICROS_PER_CENT,    // $0.50 / 5s
  "kwaivgi/kling-v1.6-pro": 35 * MICROS_PER_CENT,       // $0.35 / 5s
  "kwaivgi/kling-v1.6-standard": 25 * MICROS_PER_CENT,  // $0.25 / 5s
  "luma/ray-2-720p": 40 * MICROS_PER_CENT,              // $0.40 / 5s
};

export function usdMicrosForReplicateVideo(model: string, durationSeconds: number = 5): number {
  const base = REPLICATE_VIDEO_PRICE[model];
  if (base === undefined) {
    console.warn(`[pricing-usd] unknown Replicate video model "${model}" — using Kling 2.1 default`);
    return Math.ceil((REPLICATE_VIDEO_PRICE["kwaivgi/kling-v2.1-master"]! * durationSeconds) / 5);
  }
  return Math.ceil((base * durationSeconds) / 5);
}

// ---------- OpenAI GPT-4o (vision validation) ----------
// gpt-4o pricing: $2.50/M input, $10/M output. A typical validation call is
// ~1.5k input + ~80 output tokens.
const GPT4O_INPUT_PER_TOKEN = 2.5;
const GPT4O_OUTPUT_PER_TOKEN = 10;

export function usdMicrosForGpt4oVision(inputTokens: number, outputTokens: number): number {
  return Math.ceil(inputTokens * GPT4O_INPUT_PER_TOKEN + outputTokens * GPT4O_OUTPUT_PER_TOKEN);
}

// ---------- Free APIs ----------
// Freesound + Jamendo are free at our usage tier. We still emit a telemetry
// event with cost=0 so call volume / per-job dependence is visible in PostHog.
export function usdMicrosForFreeApi(): number {
  return 0;
}

// ---------- Conversion helpers ----------
// 1 credit = $0.001 = 1000 micros (matches the implicit ratio in meter.ts).
export const MICROS_PER_CREDIT = 1000;

export function microsToUsd(micros: number): number {
  return micros / MICROS_PER_USD;
}

export function microsToCredits(micros: number): number {
  return Math.ceil(micros / MICROS_PER_CREDIT);
}
