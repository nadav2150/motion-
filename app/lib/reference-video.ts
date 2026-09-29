// Reference-video analysis via Google Gemini (REST, no SDK dependency).
//
// Flow: the user pastes a link or uploads a clip → we hand the video to
// Gemini → Gemini returns a structured breakdown (pacing, palette, motion,
// typography, per-beat timeline, suggested copy) → formatReferenceBrief()
// turns it into a text block the Opus director reads alongside the script.
//
//   • YouTube links go straight to Gemini as file_data.file_uri (Gemini
//     fetches them itself).
//   • Anything else (direct .mp4/.mov/.webm URLs, and our own uploads in the
//     storyboards bucket) is downloaded and pushed through the Gemini Files
//     API, then polled until the file is ACTIVE.
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-3.5-flash).

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024; // 200 MB
const FILE_POLL_INTERVAL_MS = 3000;
const FILE_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export type ReferenceBeat = {
  start: number;
  end: number;
  description: string;
  onScreenText: string;
  motion: string;
  transitionOut: string;
};

export type ReferenceAnalysis = {
  summary: string;
  totalDurationSeconds: number;
  aspectRatio: string;
  pacing: string;
  editingRhythm: string;
  colorPalette: string[];
  typography: string;
  motionStyle: string;
  cameraMoves: string;
  transitions: string[];
  audioMood: string;
  beats: ReferenceBeat[];
  suggestedScript: string;
  recreationNotes: string;
  model: string;
};

const ANALYSIS_PROMPT = `You are a senior motion designer breaking down a reference video so another designer can direct a NEW motion-graphics film in the same style (not a copy of its content).

Watch the whole video and return ONLY a JSON object with exactly these keys:
{
  "summary": string,                 // 2-3 sentences: what the video is and why it works
  "totalDurationSeconds": number,
  "aspectRatio": string,             // e.g. "16:9", "9:16", "1:1"
  "pacing": string,                  // overall tempo, average shot length, where it speeds up / slows down
  "editingRhythm": string,           // cut timing relative to music/beats, holds, build-ups
  "colorPalette": string[],          // 3-6 dominant colors as #rrggbb hex
  "typography": string,              // type families/classes, weights, sizes, casing, how text animates in/out
  "motionStyle": string,             // easing character, kinetic type, layering, parallax, 2D/3D, signature moves
  "cameraMoves": string,             // virtual camera: pushes, pans, zooms, rotations, rack focus
  "transitions": string[],           // concrete transition types in order of frequency
  "audioMood": string,               // music genre/energy/BPM feel, SFX usage, voiceover presence
  "beats": [                         // one entry per distinct shot/beat, in order
    { "start": number, "end": number, "description": string, "onScreenText": string, "motion": string, "transitionOut": string }
  ],
  "suggestedScript": string,         // the video's message rewritten as a concise script (the spoken/on-screen copy), in the video's language
  "recreationNotes": string          // the 5-8 most important instructions for recreating this LOOK AND FEEL in HTML/CSS/GSAP motion graphics
}
Be concrete and specific (numbers, hex codes, named easings). No markdown, no commentary outside the JSON.`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY must be set to analyze reference videos.");
  }
  return key;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function isYouTubeUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^www\.|^m\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com";
  } catch {
    return false;
  }
}

/**
 * Accepts only public http(s) URLs. Rejects loopback / private-range IP
 * literals and bare hostnames so a pasted link can't make the server fetch
 * internal endpoints.
 */
export function validateReferenceUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Reference link is not a valid URL.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Reference link must start with http:// or https://.";
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.startsWith("[")
  ) {
    return "Reference link must be a public URL.";
  }
  return null;
}

async function downloadVideo(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Could not download reference video (HTTP ${res.status}).`);
  }
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("video/")) {
    throw new Error(
      "That link is a web page, not a video file. Paste a YouTube link or a direct .mp4/.mov/.webm link, or upload the file.",
    );
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Reference video is larger than ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Reference video is larger than ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
  }
  return { bytes, mimeType };
}

type GeminiFile = { name: string; uri: string; mimeType: string; state?: string };

/** Resumable upload to the Gemini Files API, then poll until ACTIVE. */
async function uploadToGemini(bytes: Buffer, mimeType: string, apiKey: string): Promise<GeminiFile> {
  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `videly-reference-${Date.now()}` } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    throw new Error(`Gemini upload start failed (HTTP ${start.status}): ${await start.text()}`);
  }

  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(bytes),
  });
  if (!done.ok) {
    throw new Error(`Gemini upload failed (HTTP ${done.status}): ${await done.text()}`);
  }
  let file = ((await done.json()) as { file: GeminiFile }).file;

  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS;
  while (file.state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Gemini is still processing the reference video; try again.");
    await new Promise((r) => setTimeout(r, FILE_POLL_INTERVAL_MS));
    const poll = await fetch(`${GEMINI_BASE}/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!poll.ok) throw new Error(`Gemini file status failed (HTTP ${poll.status}).`);
    file = (await poll.json()) as GeminiFile;
  }
  if (file.state === "FAILED") throw new Error("Gemini could not process the reference video.");
  return file;
}

function deleteGeminiFile(name: string, apiKey: string): void {
  void fetch(`${GEMINI_BASE}/v1beta/${name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": apiKey },
  }).catch(() => {});
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeAnalysis(raw: Record<string, unknown>, model: string): ReferenceAnalysis {
  const beats = Array.isArray(raw.beats) ? (raw.beats as Array<Record<string, unknown>>) : [];
  return {
    summary: str(raw.summary),
    totalDurationSeconds: Number(raw.totalDurationSeconds) || 0,
    aspectRatio: str(raw.aspectRatio),
    pacing: str(raw.pacing),
    editingRhythm: str(raw.editingRhythm),
    colorPalette: Array.isArray(raw.colorPalette)
      ? (raw.colorPalette as unknown[])
          .map((c) => str(c).toLowerCase())
          .filter((c) => /^#[0-9a-f]{6}$/.test(c))
          .slice(0, 6)
      : [],
    typography: str(raw.typography),
    motionStyle: str(raw.motionStyle),
    cameraMoves: str(raw.cameraMoves),
    transitions: Array.isArray(raw.transitions) ? (raw.transitions as unknown[]).map(str).filter(Boolean) : [],
    audioMood: str(raw.audioMood),
    beats: beats.slice(0, 40).map((b) => ({
      start: Number(b.start) || 0,
      end: Number(b.end) || 0,
      description: str(b.description),
      onScreenText: str(b.onScreenText),
      motion: str(b.motion),
      transitionOut: str(b.transitionOut),
    })),
    suggestedScript: str(raw.suggestedScript),
    recreationNotes: str(raw.recreationNotes),
    model,
  };
}

/** Analyze a reference video (YouTube link or direct/public video URL) with Gemini. */
export async function analyzeReferenceVideo(videoUrl: string): Promise<ReferenceAnalysis> {
  const urlError = validateReferenceUrl(videoUrl);
  if (urlError) throw new Error(urlError);

  const apiKey = getApiKey();
  const model = getModel();

  let videoPart: Record<string, unknown>;
  let uploadedName: string | null = null;
  if (isYouTubeUrl(videoUrl)) {
    videoPart = { file_data: { file_uri: videoUrl } };
  } else {
    const { bytes, mimeType } = await downloadVideo(videoUrl);
    const file = await uploadToGemini(bytes, mimeType, apiKey);
    uploadedName = file.name;
    videoPart = { file_data: { file_uri: file.uri, mime_type: file.mimeType || mimeType } };
  }

  try {
    const res = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [videoPart, { text: ANALYSIS_PROMPT }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini analysis failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini declined the reference video (${data.promptFeedback.blockReason}).`);
    }
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      throw new Error(`Gemini returned no analysis (finishReason=${data.candidates?.[0]?.finishReason ?? "unknown"}).`);
    }
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      throw new Error("Gemini returned an analysis that is not valid JSON.");
    }
    return normalizeAnalysis(parsed, model);
  } finally {
    if (uploadedName) deleteGeminiFile(uploadedName, apiKey);
  }
}

/** Render the analysis as the REFERENCE VIDEO block the Opus director reads. */
export function formatReferenceBrief(a: ReferenceAnalysis): string {
  const lines: string[] = [
    "REFERENCE VIDEO (analyzed by Gemini — match its LOOK, PACING and MOTION FEEL; write original content from the SCRIPT, do not copy the reference's content):",
    `  summary:        ${a.summary}`,
    `  duration:       ${a.totalDurationSeconds}s · aspect ${a.aspectRatio || "unknown"}`,
    `  pacing:         ${a.pacing}`,
    `  editingRhythm:  ${a.editingRhythm}`,
    `  colorPalette:   ${a.colorPalette.join(", ") || "(not detected)"}`,
    `  typography:     ${a.typography}`,
    `  motionStyle:    ${a.motionStyle}`,
    `  cameraMoves:    ${a.cameraMoves}`,
    `  transitions:    ${a.transitions.join(" · ")}`,
    `  audioMood:      ${a.audioMood}`,
  ];
  if (a.beats.length > 0) {
    lines.push("  beats:");
    for (const b of a.beats) {
      lines.push(
        `    ${b.start.toFixed(1)}–${b.end.toFixed(1)}s: ${b.description}` +
          (b.onScreenText ? ` | text: "${b.onScreenText}"` : "") +
          (b.motion ? ` | motion: ${b.motion}` : "") +
          (b.transitionOut ? ` | out: ${b.transitionOut}` : ""),
      );
    }
  }
  if (a.recreationNotes) lines.push(`  recreationNotes: ${a.recreationNotes}`);
  return lines.join("\n");
}
