// ElevenLabs text-to-speech client.
//
// Mirrors the shape of jamendo-search.ts and freesound-search.ts: one
// pure function (`generateVoiceover`) that returns an MP3 Buffer. The caller
// (app/lib/audio-resolver.ts) is responsible for uploading the Buffer to
// Supabase Storage via uploadSceneAsset() and persisting the public URL on
// the shot row.
//
// API docs: https://elevenlabs.io/docs/api-reference/text-to-speech

import { recordModelCost } from "./billing/track-cost";
import { usdMicrosForElevenLabs } from "./billing/pricing-usd";

export const TTS_MODELS = [
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "eleven_v3",
] as const;
export type TtsModelId = (typeof TTS_MODELS)[number];
export const TTS_MODEL_IDS = new Set<string>(TTS_MODELS);

// Typed error so callers can branch on the HTTP status (retry decision +
// observability) instead of regex-matching the message.
export class ElevenLabsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

// Retry tuning. ElevenLabs returns 429 `concurrent_limit_exceeded` when more
// requests run in parallel than the subscription allows; those clear in well
// under a second as in-flight calls finish, so a short exponential backoff
// recovers them. 5xx are transient too. Everything else (401 auth/quota, 422
// bad input) is non-retryable — failing fast avoids burning time and spend.
export type VoiceoverRetryOpts = { maxAttempts?: number; baseDelayMs?: number };
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 600;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ElevenLabsVoiceoverArgs = {
  text: string;
  // Voice IDs are 20-char ElevenLabs identifiers (e.g. "21m00Tcm4TlvDq8ikWAM").
  // When omitted, falls back to ELEVENLABS_DEFAULT_VOICE_ID.
  voiceId?: string;
  // Defaults to "eleven_multilingual_v2" — the most expressive narration
  // model. Turbo is faster but flatter; v3 supports inline audio tags
  // ([whispers], [sighs]) for stylized reads.
  modelId?: TtsModelId;
  // 0..1. Higher = more consistent, lower = more expressive. Default 0.5.
  stability?: number;
  // 0..1. Higher = closer to reference voice. Default 0.75.
  similarityBoost?: number;
  // 0..1. Dramatic exaggeration. Ignored by turbo_v2_5; expressive on
  // multilingual_v2 / v3. Default 0 (off).
  style?: number;
  // Sharpens speaker identity. Default true; set false for whispered /
  // intimate reads to avoid amplifying artifacts.
  useSpeakerBoost?: boolean;
};

// Default narration model — multilingual_v2 is more expressive than turbo.
// Turbo stays opt-in via per-call modelId for energetic / fast reads where
// latency matters more than naturalness.
const DEFAULT_MODEL_ID: TtsModelId = "eleven_multilingual_v2";

// Curated catalog of ElevenLabs default-library voices the audio director
// can pick from. IDs are public, stable, and require no account-side setup.
// The catalog is injected verbatim into the audio director system prompt —
// every entry costs cache-stable tokens, so prefer character variety over
// quantity. Picked to span gender, accent, age, and tonal character so the
// LLM has room to match a brand voice without falling back to "Rachel @ 0.5".
export type VoicePreset = {
  id: string;
  label: string;
  gender: "female" | "male";
  accent: string;
  tone: string;
  fitsDelivery: string;
};

export const VOICE_CATALOG: readonly VoicePreset[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    label: "Rachel",
    gender: "female",
    accent: "american",
    tone: "warm, calm, measured — classic narration",
    fitsDelivery: "cinematic, intimate, authoritative",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    label: "Adam",
    gender: "male",
    accent: "american",
    tone: "deep, grounded, declarative",
    fitsDelivery: "authoritative, cinematic",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    label: "Antoni",
    gender: "male",
    accent: "american",
    tone: "well-rounded, warm, approachable",
    fitsDelivery: "cinematic, intimate, energetic",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Bella",
    gender: "female",
    accent: "american",
    tone: "soft, young, close",
    fitsDelivery: "intimate, energetic",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    label: "Charlie",
    gender: "male",
    accent: "australian",
    tone: "casual, conversational, modern",
    fitsDelivery: "energetic, deadpan",
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    label: "Domi",
    gender: "female",
    accent: "american",
    tone: "strong, confident, punchy",
    fitsDelivery: "authoritative, energetic",
  },
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    label: "Dorothy",
    gender: "female",
    accent: "british",
    tone: "pleasant, articulate, classic — children's-book warmth",
    fitsDelivery: "intimate, cinematic",
  },
  {
    id: "2EiwWnXFnvU5JabPnv8n",
    label: "Clyde",
    gender: "male",
    accent: "american",
    tone: "weathered, raspy, gravel — war-veteran character",
    fitsDelivery: "cinematic, authoritative, deadpan",
  },
  {
    id: "D38z5RcWu1voky8WS1ja",
    label: "Fin",
    gender: "male",
    accent: "irish",
    tone: "salty, lyrical, story-teller cadence",
    fitsDelivery: "cinematic, energetic",
  },
  {
    id: "GBv7mTt0atIp3Br8iCZE",
    label: "Thomas",
    gender: "male",
    accent: "american",
    tone: "calm, soft, meditative — present and unhurried",
    fitsDelivery: "intimate, cinematic",
  },
  {
    id: "yoZ06aMxZJJ28mfd3POQ",
    label: "Sam",
    gender: "male",
    accent: "american",
    tone: "young, raspy, lived-in — indie not polish",
    fitsDelivery: "energetic, deadpan, intimate",
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    label: "Callum",
    gender: "male",
    accent: "american",
    tone: "hoarse edge, late-night radio",
    fitsDelivery: "cinematic, deadpan, intimate",
  },
] as const;

export const VOICE_CATALOG_IDS = new Set(VOICE_CATALOG.map((v) => v.id));

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  return key;
}

function getDefaultVoiceId(): string {
  const id = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  if (!id) {
    throw new Error(
      "ELEVENLABS_DEFAULT_VOICE_ID is not set (e.g. 21m00Tcm4TlvDq8ikWAM for Rachel)",
    );
  }
  return id;
}

export async function generateVoiceover(
  args: ElevenLabsVoiceoverArgs,
  opts: VoiceoverRetryOpts = {},
): Promise<Buffer> {
  const apiKey = getApiKey();
  const voiceId = args.voiceId ?? getDefaultVoiceId();
  const modelId = args.modelId ?? DEFAULT_MODEL_ID;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    voiceId,
  )}?output_format=mp3_44100_128`;
  const body = JSON.stringify({
    text: args.text,
    model_id: modelId,
    voice_settings: {
      stability: args.stability ?? 0.5,
      similarity_boost: args.similarityBoost ?? 0.75,
      style: args.style ?? 0,
      use_speaker_boost: args.useSpeakerBoost ?? true,
    },
  });

  let lastErr: ElevenLabsError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body,
    });

    if (res.ok) {
      const audio = Buffer.from(await res.arrayBuffer());

      // Cost telemetry — fires only inside a runJob() meter context. ElevenLabs
      // charges per CHARACTER (the audio endpoint doesn't return usage metadata,
      // so we use input text length, which equals what ElevenLabs bills). Only
      // the successful attempt records cost — retries never double-bill.
      const chars = args.text.length;
      void recordModelCost({
        provider: "elevenlabs",
        model: modelId,
        reason: "elevenlabs_tts",
        unitKind: "characters",
        units: chars,
        costUsdMicros: usdMicrosForElevenLabs(modelId, chars),
        latencyMs: Date.now() - startedAt,
        extra: { voice_id: voiceId, attempts: attempt },
      });

      return audio;
    }

    let detail = "";
    try {
      const errBody = (await res.json()) as { detail?: unknown };
      if (errBody.detail) detail = `: ${JSON.stringify(errBody.detail)}`;
    } catch {
      // ignore
    }
    lastErr = new ElevenLabsError(res.status, `ElevenLabs TTS failed (${res.status})${detail}`);

    // Non-retryable status, or no attempts left → surface immediately.
    if (!isRetryableStatus(res.status) || attempt === maxAttempts) {
      throw lastErr;
    }

    // Honor Retry-After when present; otherwise exponential backoff with jitter.
    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
    await sleep(backoff);
  }

  // Unreachable (the loop either returns or throws), but satisfies the type.
  throw lastErr ?? new ElevenLabsError(0, "ElevenLabs TTS failed");
}
