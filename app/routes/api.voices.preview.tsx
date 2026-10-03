import type { Route } from "./+types/api.voices.preview";
import { requireUserApi } from "../lib/auth";
import { generateVoiceover, VOICE_CATALOG, VOICE_CATALOG_IDS } from "../lib/elevenlabs-tts";
import { DEFAULT_VOICE_TONE, parseVoiceTone, VOICE_TONE_SPECS, type VoiceTone } from "../lib/studio/voice-style";

// A short fixed line per voice × tone. Speed is applied in the browser
// (audio.playbackRate keeps pitch), so the catalog is at most
// voices × tones clips, each synthesized once per server instance.
const cache = new Map<string, Promise<Buffer>>();

function sampleText(name: string, tone: VoiceTone): string {
  switch (tone) {
    case "calm":
      return `Hi, I'm ${name}. Take a breath. I'll walk your viewers through it, one step at a time.`;
    case "energetic":
      return `Hey, I'm ${name}! Let's make something people can't stop watching. Ready? Let's go!`;
    case "dramatic":
      return `I'm ${name}. Every great story starts with a single moment. This is yours.`;
    default:
      return `Hi, I'm ${name}. This is how I'll sound narrating your next video.`;
  }
}

// GET /api/voices/preview?voiceId=…&tone=natural|calm|energetic|dramatic → audio/mpeg
export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireUserApi(request);
  const params = new URL(request.url).searchParams;
  const voiceId = params.get("voiceId") ?? "";
  if (!VOICE_CATALOG_IDS.has(voiceId)) return Response.json({ error: "Unknown voice" }, { status: 400, headers });
  const toneParam = params.get("tone");
  const tone = toneParam ? parseVoiceTone(toneParam) : DEFAULT_VOICE_TONE;
  if (!tone) return Response.json({ error: "Unknown tone" }, { status: 400, headers });

  const key = `${voiceId}:${tone}`;
  let clip = cache.get(key);
  if (!clip) {
    const name = VOICE_CATALOG.find((v) => v.id === voiceId)!.label;
    const spec = VOICE_TONE_SPECS[tone];
    clip = generateVoiceover({ text: sampleText(name, tone), voiceId, stability: spec.stability, style: spec.style });
    cache.set(key, clip);
    // A failed synthesis must not stick in the cache.
    clip.catch(() => cache.delete(key));
  }
  try {
    const audio = await clip;
    const out = new Headers(headers);
    out.set("Content-Type", "audio/mpeg");
    out.set("Cache-Control", "private, max-age=86400");
    return new Response(new Uint8Array(audio), { headers: out });
  } catch (err) {
    console.warn("[voices/preview] synthesis failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Preview unavailable right now" }, { status: 502, headers });
  }
}
