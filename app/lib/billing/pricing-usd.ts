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
// Public Anthropic pricing (per 1M tokens, as of 2026-05-20):
//   claude-opus-4-8   : $15 in, $75 out  → 15  micros/token in, 75  micros/token out
//   claude-opus-4-7   : $15 in, $75 out  → 15  micros/token in, 75  micros/token out
//   claude-sonnet-4-6 : $3  in, $15 out  → 3   micros/token in, 15  micros/token out
// Cache reads bill at ~10% of base input; cache_creation_input_tokens bill at
// 1.25x base. We already factor cache_create into tokensIn upstream, and
// response.usage.input_tokens excludes cache_read — so passing usage straight
// through is close enough for the average. No need to model cache pricing
// here; the variance is small at our volumes.
const ANTHROPIC_PRICE_TABLE: Record<string, { inputPerToken: number; outputPerToken: number }> = {
  "claude-opus-4-8": { inputPerToken: 15, outputPerToken: 75 },
  "claude-opus-4-7": { inputPerToken: 15, outputPerToken: 75 },
  "claude-sonnet-4-6": { inputPerToken: 3, outputPerToken: 15 },
};

export function usdMicrosForAnthropic(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = ANTHROPIC_PRICE_TABLE[model];
  if (!price) {
    console.warn(`[pricing-usd] unknown Anthropic model "${model}" — defaulting to Opus pricing`);
    return usdMicrosForAnthropic("claude-opus-4-8", inputTokens, outputTokens);
  }
  return inputTokens * price.inputPerToken + outputTokens * price.outputPerToken;
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
