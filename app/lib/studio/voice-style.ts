// Voiceover speed + tone: the options the prompt card offers and how each
// maps onto ElevenLabs. Client-safe (no node imports) — the home screen,
// job validation, the planner and the TTS recorder all read it.

export const VOICE_SPEEDS = [1, 1.1, 1.5, 2] as const;
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

export const VOICE_TONES = ["natural", "calm", "energetic", "dramatic"] as const;
export type VoiceTone = (typeof VOICE_TONES)[number];

type ToneSpec = {
  label: string;
  // ElevenLabs voice_settings: lower stability + higher style = more expressive.
  stability: number;
  style: number;
  // Fed to the planner so the script is written for the read.
  writing: string;
};

export const VOICE_TONE_SPECS: Record<VoiceTone, ToneSpec> = {
  natural: { label: "Natural", stability: 0.5, style: 0, writing: "natural and conversational" },
  calm: { label: "Calm", stability: 0.75, style: 0.1, writing: "calm, warm and reassuring; unhurried phrasing" },
  energetic: { label: "Energetic", stability: 0.3, style: 0.6, writing: "upbeat and punchy; short lines, strong verbs" },
  dramatic: { label: "Dramatic", stability: 0.35, style: 0.85, writing: "cinematic and dramatic; build tension, land on short beats" },
};

export const DEFAULT_VOICE_SPEED: VoiceSpeed = 1;
export const DEFAULT_VOICE_TONE: VoiceTone = "natural";

export function parseVoiceSpeed(v: unknown): VoiceSpeed | null {
  const n = typeof v === "string" ? Number(v) : v;
  return (VOICE_SPEEDS as readonly unknown[]).includes(n) ? (n as VoiceSpeed) : null;
}

export function parseVoiceTone(v: unknown): VoiceTone | null {
  return (VOICE_TONES as readonly unknown[]).includes(v) ? (v as VoiceTone) : null;
}

// ElevenLabs accepts voice_settings.speed in [0.7, 1.2]. Faster reads are
// recorded at the native maximum and the rest is applied as an ffmpeg tempo
// change (pitch-preserving), so 2× = 1.2 native × 1.667 tempo.
export const MAX_NATIVE_SPEED = 1.2;

export function splitSpeed(speed: number): { native: number; tempo: number } {
  if (speed <= MAX_NATIVE_SPEED) return { native: speed, tempo: 1 };
  return { native: MAX_NATIVE_SPEED, tempo: speed / MAX_NATIVE_SPEED };
}

export function formatSpeed(speed: number): string {
  return `${speed}×`;
}
