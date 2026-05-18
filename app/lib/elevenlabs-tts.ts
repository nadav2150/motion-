// ElevenLabs text-to-speech client.
//
// Mirrors the shape of jamendo-search.ts and freesound-search.ts: one
// pure function (`generateVoiceover`) that returns an MP3 Buffer. The caller
// (app/lib/audio-resolver.ts) is responsible for uploading the Buffer to
// Supabase Storage via uploadSceneAsset() and persisting the public URL on
// the shot row.
//
// API docs: https://elevenlabs.io/docs/api-reference/text-to-speech

export type ElevenLabsVoiceoverArgs = {
  text: string;
  // Voice IDs are 20-char ElevenLabs identifiers (e.g. "21m00Tcm4TlvDq8ikWAM").
  // When omitted, falls back to ELEVENLABS_DEFAULT_VOICE_ID.
  voiceId?: string;
  // Defaults to "eleven_turbo_v2_5" — fastest model with multilingual support.
  // Use "eleven_multilingual_v2" if quality > latency.
  modelId?: string;
  // 0..1. Higher = more consistent, lower = more expressive. Default 0.5.
  stability?: number;
  // 0..1. Higher = closer to reference voice. Default 0.75.
  similarityBoost?: number;
};

const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

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
