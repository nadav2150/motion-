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
  // Voice IDs are 20-char ElevenLabs identifiers (e.g. "EXAVITQu4vr4xnSDxMaL").
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
  // Native read speed, 0.7..1.2 (ElevenLabs' range). Omitted = the voice's default.
  speed?: number;
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

// ElevenLabs "premade" voices only: they work on every ElevenLabs plan,
// including the free API tier. Legacy library voices (Rachel, Antoni, Domi,
// Dorothy, Clyde, Fin, Thomas, Sam) now return 402 "Free users cannot use
// library voices via the API". The first entry is the default.
export const VOICE_CATALOG: readonly VoicePreset[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Sarah",
    gender: "female",
    accent: "american",
    tone: "mature, reassuring, confident — polished narration",
    fitsDelivery: "cinematic, authoritative, intimate",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    label: "Adam",
    gender: "male",
    accent: "american",
    tone: "dominant, firm, declarative",
    fitsDelivery: "authoritative, cinematic",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    label: "George",
    gender: "male",
    accent: "british",
    tone: "warm, captivating storyteller",
    fitsDelivery: "cinematic, intimate",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    label: "Alice",
    gender: "female",
    accent: "british",
    tone: "clear, engaging educator",
    fitsDelivery: "authoritative, intimate",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    label: "Brian",
    gender: "male",
    accent: "american",
    tone: "deep, resonant, comforting",
    fitsDelivery: "cinematic, authoritative",
  },
  {
    id: "cgSgspJ2msm6clMCkdW9",
    label: "Jessica",
    gender: "female",
    accent: "american",
    tone: "playful, bright, warm",
    fitsDelivery: "energetic, intimate",
  },
  {
    id: "TX3LPaxmHKxFdv7VOQHJ",
    label: "Liam",
    gender: "male",
    accent: "american",
    tone: "energetic social-media creator",
    fitsDelivery: "energetic",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    label: "Laura",
    gender: "female",
    accent: "american",
    tone: "enthusiastic, quirky attitude",
    fitsDelivery: "energetic, deadpan",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    label: "Daniel",
    gender: "male",
    accent: "british",
    tone: "steady broadcaster, formal",
    fitsDelivery: "authoritative, deadpan",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    label: "Lily",
    gender: "female",
    accent: "british",
    tone: "velvety, confident actress",
    fitsDelivery: "cinematic, intimate",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    label: "Charlie",
    gender: "male",
    accent: "australian",
    tone: "deep, confident, energetic",
    fitsDelivery: "energetic, deadpan",
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    label: "Matilda",
    gender: "female",
    accent: "american",
    tone: "knowledgeable, professional, upbeat",
    fitsDelivery: "authoritative, energetic",
  },
  {
    id: "cjVigY5qzO86Huf0OWal",
    label: "Eric",
    gender: "male",
    accent: "american",
    tone: "smooth, trustworthy, classy",
    fitsDelivery: "intimate, authoritative",
  },
  {
    id: "hpp4J3VqNfWAUOO0d1Us",
    label: "Bella",
    gender: "female",
    accent: "american",
    tone: "professional, bright, warm",
    fitsDelivery: "intimate, energetic",
  },
  {
    id: "pqHfZKP75CvOlQylNhV4",
    label: "Bill",
    gender: "male",
    accent: "american",
    tone: "wise, mature, balanced — crisp ad read",
    fitsDelivery: "authoritative, cinematic",
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    label: "Callum",
    gender: "male",
    accent: "american",
    tone: "husky, playful trickster",
    fitsDelivery: "cinematic, deadpan",
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
      "ELEVENLABS_DEFAULT_VOICE_ID is not set (e.g. EXAVITQu4vr4xnSDxMaL for Sarah)",
    );
  }
  return id;
}

export async function generateVoiceover(
  args: ElevenLabsVoiceoverArgs,
  opts: VoiceoverRetryOpts = {},
): Promise<Buffer> {
  const res = await postTts(args, opts, "", "audio/mpeg");
  return Buffer.from(await res.arrayBuffer());
}

// Character-level alignment from /with-timestamps. Arrays are parallel.
export type TtsAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type VoiceoverWithTimestamps = {
  audio: Buffer; // mp3 44.1kHz 128kbps
  alignment: TtsAlignment | null; // aligned to the input text
  normalizedAlignment: TtsAlignment | null; // aligned to the normalized text
};

/**
 * TTS with character timings (POST /v1/text-to-speech/{voice}/with-timestamps).
 * Same retry/metering behaviour as generateVoiceover. The alignment lets the
 * Studio pipeline place on-screen beats exactly on the spoken words.
 */
export async function generateVoiceoverWithTimestamps(
  args: ElevenLabsVoiceoverArgs,
  opts: VoiceoverRetryOpts = {},
): Promise<VoiceoverWithTimestamps> {
  const res = await postTts(args, opts, "/with-timestamps", "application/json");
  const data = (await res.json()) as {
    audio_base64?: string;
    alignment?: TtsAlignment | null;
    normalized_alignment?: TtsAlignment | null;
  };
  if (!data.audio_base64) {
    throw new ElevenLabsError(502, "ElevenLabs with-timestamps returned no audio");
  }
  return {
    audio: Buffer.from(data.audio_base64, "base64"),
    alignment: data.alignment ?? null,
    normalizedAlignment: data.normalized_alignment ?? null,
  };
}

// Shared POST with retries + metering. Returns the OK response unread.
async function postTts(
  args: ElevenLabsVoiceoverArgs,
  opts: VoiceoverRetryOpts,
  pathSuffix: "" | "/with-timestamps",
  accept: string,
): Promise<Response> {
  const apiKey = getApiKey();
  const voiceId = args.voiceId ?? getDefaultVoiceId();
  const modelId = args.modelId ?? DEFAULT_MODEL_ID;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    voiceId,
  )}${pathSuffix}?output_format=mp3_44100_128`;
  const body = JSON.stringify({
    text: args.text,
    model_id: modelId,
    voice_settings: {
      stability: args.stability ?? 0.5,
      similarity_boost: args.similarityBoost ?? 0.75,
      style: args.style ?? 0,
      use_speaker_boost: args.useSpeakerBoost ?? true,
      ...(args.speed !== undefined ? { speed: Math.min(1.2, Math.max(0.7, args.speed)) } : {}),
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
        Accept: accept,
      },
      body,
    });

    if (res.ok) {
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
        extra: { voice_id: voiceId, attempts: attempt, timestamps: pathSuffix !== "" },
      });

      return res;
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
