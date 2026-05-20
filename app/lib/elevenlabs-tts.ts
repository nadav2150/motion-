// ElevenLabs text-to-speech client.
//
// Mirrors the shape of jamendo-search.ts and freesound-search.ts: one
// pure function (`generateVoiceover`) that returns an MP3 Buffer. The caller
// (app/lib/audio-resolver.ts) is responsible for uploading the Buffer to
// Supabase Storage via uploadSceneAsset() and persisting the public URL on
// the shot row.
//
// API docs: https://elevenlabs.io/docs/api-reference/text-to-speech

export const TTS_MODELS = [
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "eleven_v3",
] as const;
export type TtsModelId = (typeof TTS_MODELS)[number];
export const TTS_MODEL_IDS = new Set<string>(TTS_MODELS);

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
): Promise<Buffer> {
  const apiKey = getApiKey();
  const voiceId = args.voiceId ?? getDefaultVoiceId();
  const modelId = args.modelId ?? DEFAULT_MODEL_ID;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    voiceId,
  )}?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: args.text,
      model_id: modelId,
      voice_settings: {
        stability: args.stability ?? 0.5,
        similarity_boost: args.similarityBoost ?? 0.75,
        style: args.style ?? 0,
        use_speaker_boost: args.useSpeakerBoost ?? true,
      },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (body.detail) detail = `: ${JSON.stringify(body.detail)}`;
    } catch {
      // ignore
    }
    throw new Error(`ElevenLabs TTS failed (${res.status})${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
