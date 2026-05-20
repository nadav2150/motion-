import Replicate from "replicate";
import { recordModelCost } from "./billing/track-cost";
import {
  usdMicrosForReplicateImage,
  usdMicrosForReplicateVideo,
} from "./billing/pricing-usd";

export const FLUX_ULTRA = "black-forest-labs/flux-1.1-pro-ultra";
export const IMAGEN_3 = "google/imagen-3";
export const NANO_BANANA = "google/nano-banana";
export const IDEOGRAM_V3 = "ideogram-ai/ideogram-v3-quality";

export const DEFAULT_IMAGE_MODEL = IDEOGRAM_V3;

export const SUPPORTED_IMAGE_MODELS = [
  IDEOGRAM_V3,
  FLUX_ULTRA,
  IMAGEN_3,
  NANO_BANANA,
] as const;
export type ImageModel = (typeof SUPPORTED_IMAGE_MODELS)[number];

export function isSupportedImageModel(value: string): value is ImageModel {
  return (SUPPORTED_IMAGE_MODELS as readonly string[]).includes(value);
}

export const KLING_V21_MASTER = "kwaivgi/kling-v2.1-master";
export const KLING_PRO = "kwaivgi/kling-v1.6-pro";
export const KLING_STANDARD = "kwaivgi/kling-v1.6-standard";
export const LUMA_RAY = "luma/ray-2-720p";

export const DEFAULT_VIDEO_MODEL = KLING_V21_MASTER;

export const SUPPORTED_VIDEO_MODELS = [
  KLING_V21_MASTER,
  KLING_PRO,
  KLING_STANDARD,
  LUMA_RAY,
] as const;
export type VideoModel = (typeof SUPPORTED_VIDEO_MODELS)[number];

export function isSupportedVideoModel(value: string): value is VideoModel {
  return (SUPPORTED_VIDEO_MODELS as readonly string[]).includes(value);
}

let cached: Replicate | null = null;
function getReplicate(): Replicate {
  if (cached) return cached;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN must be set in .env");
  cached = new Replicate({ auth: token });
  return cached;
}

// Emit a model_cost telemetry event for a Replicate run. No-op when called
// outside a runJob (scripts, smoke tests). Phase A: log-only, never block the
// call on a ledger / PostHog failure.
function meterReplicateImage(model: string, latencyMs: number): void {
  void recordModelCost({
    provider: "replicate_image",
    model,
    reason: "replicate_image",
    unitKind: "calls",
    units: 1,
    costUsdMicros: usdMicrosForReplicateImage(model),
    latencyMs,
  });
}

function meterReplicateVideo(model: string, durationSeconds: number, latencyMs: number): void {
  void recordModelCost({
    provider: "replicate_video",
    model,
    reason: "replicate_video",
    unitKind: "seconds",
    units: durationSeconds,
    costUsdMicros: usdMicrosForReplicateVideo(model, durationSeconds),
    latencyMs,
  });
}

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:2";

export type RunImageOptions = {
  model: ImageModel;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
};

export type RunImageResult = {
  url: string;
  replicateId: string | null;
  model: ImageModel;
};

// Flux 1.1 Pro Ultra, Nano Banana, and Ideogram v3 have NO negative-prompt
// input — every token in their `prompt` field is positive conditioning.
// Writing "AVOID: mountains" actually steers them toward mountains. So for
// those models we never merge negatives into the prompt; we just drop them.
// Imagen 3 has a real native `negative_prompt` field and uses it directly.

function firstUrlFromOutput(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    return typeof first === "string" ? first : null;
  }
  if (output && typeof output === "object") {
    const maybeUrl = (output as { url?: unknown }).url;
    if (typeof maybeUrl === "function") {
      try {
        const u = (maybeUrl as () => unknown).call(output);
        if (typeof u === "string") return u;
        if (u && typeof u === "object" && "href" in (u as Record<string, unknown>)) {
          const href = (u as { href?: unknown }).href;
          if (typeof href === "string") return href;
        }
      } catch {
        // fall through
      }
    }
    if (typeof maybeUrl === "string") return maybeUrl;
  }
  return null;
}

function inputForModel(
  model: ImageModel,
  prompt: string,
  negativePrompt: string | undefined,
  aspectRatio: AspectRatio,
): Record<string, unknown> {
  switch (model) {
    case FLUX_ULTRA:
      // Flux Ultra: only `prompt` is conditioning. Negatives are discarded
      // intentionally — they would pollute positive conditioning.
      return {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: "jpg",
        safety_tolerance: 5,
        raw: false,
      };
    case IMAGEN_3: {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        safety_filter_level: "block_only_high",
      };
      const neg = negativePrompt?.trim();
      if (neg) input.negative_prompt = neg;
      return input;
    }
    case NANO_BANANA:
      // Nano Banana: only `prompt` is conditioning. Negatives are discarded.
      return {
        prompt,
        output_format: "jpg",
      };
    case IDEOGRAM_V3:
      // Ideogram v3: best-in-class for legible typography and UI text — the
      // reason it's the default for motion-design shots. No negative_prompt.
      // style_type="Design" tunes it for UI/typography work; magic_prompt
      // "Off" preserves the director's hand-crafted prompt verbatim.
      return {
        prompt,
        aspect_ratio: aspectRatio,
        style_type: "Design",
        magic_prompt_option: "Off",
      };
  }
}

function statusFromError(err: unknown): number | null {
  if (!err) return null;
  const e = err as { response?: { status?: unknown }; status?: unknown; message?: unknown };
  const direct = typeof e.status === "number" ? e.status : null;
  if (direct) return direct;
  const fromResponse =
    e.response && typeof e.response.status === "number" ? e.response.status : null;
  if (fromResponse) return fromResponse;
  // Replicate SDK surfaces errors like "Request to ... failed with status 429 Too Many Requests".
  if (typeof e.message === "string") {
    const match = e.message.match(/status\s+(\d{3})/);
    if (match) return parseInt(match[1]!, 10);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

export type RunVideoOptions = {
  model: VideoModel;
  prompt: string;
  imageUrl: string;
  negativePrompt?: string;
  durationSeconds?: 5 | 10;
  aspectRatio?: AspectRatio;
};

export type RunVideoResult = {
  url: string;
  replicateId: string | null;
  model: VideoModel;
};

function videoInputForModel(
  model: VideoModel,
  prompt: string,
  imageUrl: string,
  negativePrompt: string | undefined,
  durationSeconds: 5 | 10,
  aspectRatio: AspectRatio,
): Record<string, unknown> {
  const neg = negativePrompt?.trim() || "";
  switch (model) {
    case KLING_V21_MASTER:
      // Kling 2.1 Master: 1080p, accepts negative_prompt, NO cfg_scale (was
      // removed vs 1.6). aspect_ratio is ignored when start_image is set,
      // but we pass it anyway for clarity. Only 16:9 / 9:16 / 1:1 supported.
      return {
        prompt,
        start_image: imageUrl,
        duration: durationSeconds,
        aspect_ratio: aspectRatio,
        negative_prompt: neg,
      };
    case KLING_PRO:
    case KLING_STANDARD:
      return {
        prompt,
        start_image: imageUrl,
        duration: durationSeconds,
        aspect_ratio: aspectRatio,
        negative_prompt: neg,
        cfg_scale: 0.5,
      };
    case LUMA_RAY:
      return {
        prompt,
        start_image_url: imageUrl,
        aspect_ratio: aspectRatio,
        duration: `${durationSeconds}s`,
        loop: false,
      };
  }
}

export async function runVideo(options: RunVideoOptions): Promise<RunVideoResult> {
  const {
    model,
    prompt,
    imageUrl,
    negativePrompt,
    durationSeconds = 5,
    aspectRatio = "16:9",
  } = options;
  const replicate = getReplicate();
  const input = videoInputForModel(model, prompt, imageUrl, negativePrompt, durationSeconds, aspectRatio);

  let attempt = 0;
  let lastError: unknown;
  const startedAt = Date.now();
  while (attempt <= MAX_RETRIES) {
    try {
      const output = await replicate.run(model as `${string}/${string}`, { input });
      const url = firstUrlFromOutput(output);
      if (!url) {
        throw new Error(
          `Replicate video model ${model} returned unexpected output shape: ${JSON.stringify(output).slice(0, 200)}`,
        );
      }
      meterReplicateVideo(model, durationSeconds, Date.now() - startedAt);
      return { url, replicateId: null, model };
    } catch (err) {
      lastError = err;
      const status = statusFromError(err);
      if (status === null || !RETRY_STATUSES.has(status) || attempt === MAX_RETRIES) {
        throw err;
      }
      const delay = 2000 * 2 ** attempt + Math.floor(Math.random() * 1000);
      console.warn(
        `Replicate video ${model} returned ${status}; retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastError ?? new Error("runVideo exhausted retries");
}

export async function runImage(options: RunImageOptions): Promise<RunImageResult> {
  const { model, prompt, negativePrompt, aspectRatio = "16:9" } = options;
  const replicate = getReplicate();
  const input = inputForModel(model, prompt, negativePrompt, aspectRatio);

  let attempt = 0;
  let lastError: unknown;
  const startedAt = Date.now();
  while (attempt <= MAX_RETRIES) {
    try {
      const output = await replicate.run(model as `${string}/${string}`, { input });
      const url = firstUrlFromOutput(output);
      if (!url) {
        throw new Error(
          `Replicate model ${model} returned unexpected output shape: ${JSON.stringify(output).slice(0, 200)}`,
        );
      }
      meterReplicateImage(model, Date.now() - startedAt);
      return { url, replicateId: null, model };
    } catch (err) {
      lastError = err;
      const status = statusFromError(err);
      if (status === null || !RETRY_STATUSES.has(status) || attempt === MAX_RETRIES) {
        throw err;
      }
      // Exponential backoff with jitter: 2s, 4s, 8s, 16s (+0-1s jitter).
      const delay = 2000 * 2 ** attempt + Math.floor(Math.random() * 1000);
      console.warn(
        `Replicate ${model} returned ${status}; retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastError ?? new Error("runImage exhausted retries");
}

export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      try {
        const value = await tasks[index]();
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
