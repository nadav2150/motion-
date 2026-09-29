// Studio (v2) generation pipeline.
//
//   parseCreateStudioJobInput()  validate POST /api/studio/jobs bodies (pure)
//   createStudioJob()            estimate → reserveCredits → insert → run
//   runStudioJob()               reference → plan → (voiceover ∥ images ∥
//                                music) → code → validate/repair → review →
//                                revision(s) → preview_ready → render → done
//   runStudioRender()            Export modal: render → mux → upload
//   duplicateStudioJob()         copy of a video's current revision
//   studioTimeline()             cached frame strip for the video page
//
// Storage layout: storyboards/jobs/<id>/v2/rev-<n>/{index.html,thumb.jpg,video.mp4}
// and jobs/<id>/v2/audio/{voiceover,music}.mp3.

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { adjustBalance, attachReservationToJob, getOrCreateBilling, reserveCredits } from "../billing/credits";
import { getPlanFeatures, type PlanFeatures } from "../billing/plan-features";
import { recordModelCost } from "../billing/track-cost";
import { scrapeBrand } from "../brand-scrape";
import { VOICE_CATALOG_IDS } from "../elevenlabs-tts";
import { injectWatermarkOverlay } from "../hyperframes/watermark";
import {
  analyzeReferenceVideo,
  fetchPublicUrl,
  isYouTubeUrl,
  validateReferenceUrl,
  type ReferenceAnalysis,
} from "../reference-video";
import { FLUX_ULTRA, runImage, type AspectRatio } from "../replicate";
import { getSupabase } from "../supabase";
import { mirrorAssetForJob, STORYBOARDS_BUCKET, uploadBuffer } from "../storage";
import { callOpus, extractHtmlDocument, remainingBudget, STUDIO_MODEL, type OpusEffort } from "./anthropic";
import {
  downloadAudio,
  mixAndMux,
  normalizePlanTimings,
  pickMusicTrack,
  recordVoiceover,
  remapBeats,
  scaleBeats,
  computeFinalDuration,
} from "./audio";
import {
  downloadBuffer,
  downloadText,
  getBrandKit,
  getRevision,
  getStudioJob,
  insertUserAsset,
  isBrandKitEmpty,
  jobDuration,
  nextRevisionNumber,
  publicUrl,
  revisionPaths,
  setStage,
  stageOf,
  storageHost,
  updateJob,
  updateRevision,
  type StudioAudioRecord,
  type StudioJobRow,
  type StudioPlanRecord,
} from "./db";
import {
  capture,
  docContextFor,
  hasBlockingErrors,
  pickThumbFrame,
  planWatermark,
  repairUntilValid,
  saveRevision,
  validateWith,
  withStudioOperation,
  applyPatchEdits,
  type DocContext,
} from "./edit";
import { estimateStudioJob, MAX_GENERATED_IMAGES, renderCredits } from "./estimate";
import {
  clampTargetDuration,
  exportDimensions,
  isStudioFormat,
  maxVideoDuration,
  QUALITY_CRF,
  resolveFormat,
} from "./format";
import {
  buildCodeMessages,
  buildPlanMessages,
  buildReviewMessages,
  CODE_TASK,
  PLAN_SCHEMA,
  PLAN_TASK,
  REVIEW_SCHEMA,
  REVIEW_TASK,
  systemFor,
  type GeneratedAsset,
  type LockedAsset,
  type RawPlan,
  type ReviewResponse,
  type WebsiteBrief,
} from "./prompts";
import { captureFrames, renderVideo } from "./render";
import { getTemplate } from "./templates";
import {
  DEFAULT_FPS,
  DURATION_OPTIONS,
  FORMAT_PRESETS,
  type BrandKit,
  type CreateStudioJobInput,
  type ExportOptions,
  type StudioLibrary,
  type StudioPlan,
  type StudioSource,
  type StudioStage,
} from "./types";

const CODE_EFFORT: OpusEffort =
  (["high", "xhigh", "max"] as const).find((e) => e === process.env.STUDIO_CODE_EFFORT) ?? "high";
// Reserve enough budget for a review call (frames + document + patch JSON).
const REVIEW_MIN_BUDGET = 60_000;
const REVIEW_FRAMES = 12;

// ─── Input validation ──────────────────────────────────────────────────────

export class StudioInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioInputError";
  }
}

export class StudioCreditsError extends Error {
  constructor(public readonly needed: number, public readonly balance: number) {
    super(`Not enough credits: need ${needed}, balance ${balance}`);
    this.name = "StudioCreditsError";
  }
}

const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_SOURCES = 8;
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const VOICE_ID_RE = /^[A-Za-z0-9]{16,32}$/;

export type InputPolicy = {
  planMaxDuration: number;
  maxPromptChars: number | null; // plan cap (Free: 700); null = MAX_PROMPT_CHARS
  audioAllowed: boolean;
  storageHost: string | null;
};

export function policyFor(features: PlanFeatures): Omit<InputPolicy, "storageHost"> {
  return {
    planMaxDuration: features.maxStudioDuration,
    maxPromptChars: features.maxScriptChars,
    audioAllowed: features.audio,
  };
}

function isOwnStorageUrl(url: string, host: string | null): boolean {
  if (!host) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === host && u.pathname.includes(`/${STORYBOARDS_BUCKET}/`);
  } catch {
    return false;
  }
}

/** Validate + normalize a POST /api/studio/jobs body. Throws StudioInputError. */
export function parseCreateStudioJobInput(body: unknown, policy: InputPolicy): CreateStudioJobInput {
  if (!body || typeof body !== "object") throw new StudioInputError("Body must be a JSON object");
  const b = body as Record<string, unknown>;

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const cap = Math.min(MAX_PROMPT_CHARS, policy.maxPromptChars ?? MAX_PROMPT_CHARS);
  if (prompt.length > cap) {
    throw new StudioInputError(`Your prompt is ${prompt.length} characters; the limit on your plan is ${cap}.`);
  }

  const format = b.format ?? "16:9";
  if (!isStudioFormat(format)) throw new StudioInputError("format must be 16:9, 9:16, 1:1 or match");

  const rawDuration = Number(b.targetDuration ?? 30);
  if (!(DURATION_OPTIONS as readonly number[]).includes(rawDuration)) {
    throw new StudioInputError(`targetDuration must be one of ${DURATION_OPTIONS.join(", ")}`);
  }
  const targetDuration = clampTargetDuration(rawDuration, policy.planMaxDuration);

  const language = typeof b.language === "string" && b.language.trim() ? b.language.trim() : "en";
  if (!LANGUAGE_RE.test(language)) throw new StudioInputError("language must be a BCP-47 code like en or he");

  let voiceId: string | null = null;
  if (b.voiceId !== null && b.voiceId !== undefined && b.voiceId !== "") {
    if (typeof b.voiceId !== "string" || !(VOICE_CATALOG_IDS.has(b.voiceId) || VOICE_ID_RE.test(b.voiceId))) {
      throw new StudioInputError("voiceId is not a known voice");
    }
    voiceId = b.voiceId;
  }
  let musicEnabled = b.musicEnabled !== false;
  if (!policy.audioAllowed) {
    voiceId = null;
    musicEnabled = false;
  }

  const rawSources = Array.isArray(b.sources) ? b.sources : [];
  const sources: StudioSource[] = [];
  let videoRefs = 0;
  let images = 0;
  for (const s of rawSources) {
    if (!s || typeof s !== "object") throw new StudioInputError("Invalid source");
    const src = s as Record<string, unknown>;
    const url = typeof src.url === "string" ? src.url.trim() : "";
    const name = typeof src.name === "string" ? src.name.trim().slice(0, 200) : "";
    switch (src.kind) {
      case "youtube":
      case "video_url": {
        const err = validateReferenceUrl(url);
        if (err) throw new StudioInputError(err);
        if (src.kind === "youtube" && !isYouTubeUrl(url)) throw new StudioInputError("That is not a YouTube link");
        videoRefs++;
        sources.push({ kind: src.kind, url });
        break;
      }
      case "upload": {
        if (!isOwnStorageUrl(url, policy.storageHost)) throw new StudioInputError("Upload the reference video first");
        videoRefs++;
        sources.push({
          kind: "upload",
          url,
          name: name || "Reference video",
          ...(typeof src.storagePath === "string" ? { storagePath: src.storagePath } : {}),
        });
        break;
      }
      case "website": {
        const err = validateReferenceUrl(url);
        if (err) throw new StudioInputError(err.replace("Reference link", "Website link"));
        sources.push({ kind: "website", url });
        break;
      }
      case "image": {
        if (!isOwnStorageUrl(url, policy.storageHost)) throw new StudioInputError("Images must be uploaded to your assets first");
        images++;
        sources.push({
          kind: "image",
          url,
          name: name || `Image ${images}`,
          ...(typeof src.storagePath === "string" ? { storagePath: src.storagePath } : {}),
          ...(typeof src.assetId === "string" ? { assetId: src.assetId } : {}),
        });
        break;
      }
      default:
        throw new StudioInputError("Unknown source kind");
    }
  }
  if (videoRefs > 1) throw new StudioInputError("Attach at most one reference video");
  if (images > MAX_IMAGE_SOURCES) throw new StudioInputError(`Attach at most ${MAX_IMAGE_SOURCES} images`);
  if (sources.filter((s) => s.kind === "website").length > 1) throw new StudioInputError("Attach at most one website");

  const templateId = typeof b.templateId === "string" && b.templateId ? b.templateId : null;
  if (templateId && !getTemplate(templateId)) throw new StudioInputError("Unknown template");

  if (!prompt && sources.length === 0 && !templateId) {
    throw new StudioInputError("Describe your video, or attach a reference, website or template.");
  }

  return {
    prompt,
    format,
    targetDuration,
    language,
    voiceId,
    musicEnabled,
    sources,
    useBrandKit: b.useBrandKit !== false,
    templateId,
  };
}

function videoReference(sources: StudioSource[]): string | null {
  const s = sources.find((x) => x.kind === "youtube" || x.kind === "video_url" || x.kind === "upload");
  return s ? s.url : null;
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createStudioJob(
  input: CreateStudioJobInput,
  user: { id: string },
): Promise<{ id: string; estimate: number }> {
  const billing = await getOrCreateBilling(user.id);
  const features = getPlanFeatures(billing.plan_tier);
  const refUrl = videoReference(input.sources);
  const preset = input.format === "match" ? FORMAT_PRESETS["16:9"] : FORMAT_PRESETS[input.format];
  const estimate = estimateStudioJob({
    targetDuration: input.targetDuration,
    maxDuration: maxVideoDuration(input.targetDuration, features.maxStudioDuration),
    voiceover: !!input.voiceId,
    music: input.musicEnabled,
    reference: !!refUrl,
  }).total;

  const reservationKey = `reserve:${crypto.randomUUID()}`;
  const reserve = await reserveCredits(user.id, estimate, null, reservationKey);
  if (!reserve.ok) throw new StudioCreditsError(reserve.required, reserve.balance);

  const template = getTemplate(input.templateId);
  const record: StudioPlanRecord = {
    version: 1,
    input: { sources: input.sources, useBrandKit: input.useBrandKit, templateId: input.templateId ?? null },
    plan: null,
  };
  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .insert({
      user_id: user.id,
      generation_mode: "v2",
      status: "pending",
      stage_label: "Queued",
      progress: 0,
      script: input.prompt || template?.prompt || "",
      prompt: input.prompt,
      format: input.format,
      width: preset.width,
      height: preset.height,
      fps: DEFAULT_FPS,
      target_duration: input.targetDuration,
      language: input.language,
      voice_id: input.voiceId,
      voiceover_enabled: !!input.voiceId,
      music_enabled: input.musicEnabled,
      template_id: input.templateId ?? null,
      seed: 1 + Math.floor(Math.random() * 2_147_483_646),
      studio_plan: record,
      current_revision: 0,
      reference_video_url: refUrl,
      director_model: STUDIO_MODEL,
      cost_estimate_credits: estimate,
    })
    .select("id")
    .single();
  if (error || !data) {
    // The reservation has no job to settle against; hand it back.
    await adjustBalance({
      userId: user.id,
      amount: estimate,
      kind: "refund",
      reason: "studio_insert_failed",
      idempotencyKey: `refund:${reservationKey}`,
    }).catch((e) => console.error("[studio] refund after failed insert failed:", e));
    throw new Error(`createStudioJob insert failed: ${error?.message ?? "no row"}`);
  }
  const id = data.id as string;
  await attachReservationToJob(reservationKey, id);

  // Reference uploads show up in the Assets library.
  for (const s of input.sources) {
    if (s.kind === "upload" && s.storagePath) {
      void insertUserAsset({
        userId: user.id,
        kind: "video",
        name: s.name,
        url: s.url,
        path: s.storagePath,
        source: "reference",
        jobId: id,
      }).catch((err) => console.warn(`[studio ${id}] reference asset row failed:`, err instanceof Error ? err.message : err));
    }
  }

  void runStudioJob(id).catch((err) => console.error(`runStudioJob(${id}) threw:`, err));
  return { id, estimate };
}

// ─── Plan normalization ────────────────────────────────────────────────────

const LIBS: StudioLibrary[] = ["gsap", "three", "lottie", "anime", "splitting", "simplex-noise"];

export function normalizePlan(
  raw: RawPlan,
  opts: { cap: number; voiceover: boolean; music: boolean },
): StudioPlan {
  const hex = (c: string) => /^#[0-9a-f]{6}$/i.test(c.trim());
  const plan: StudioPlan = {
    title: (raw.title ?? "").trim().slice(0, 80) || "Untitled video",
    concept: (raw.concept ?? "").trim(),
    duration: Number(raw.duration) || opts.cap,
    palette: (raw.palette ?? []).map((c) => c.trim().toLowerCase()).filter(hex).slice(0, 6),
    typography: {
      heading: raw.typography?.heading?.trim() || "Inter",
      body: raw.typography?.body?.trim() || "Inter",
    },
    beats: (raw.beats ?? []).map((b) => ({
      start: Number(b.start),
      end: Number(b.end),
      visual: b.visual ?? "",
      technique: b.technique ?? "",
      ...(b.onScreenText ? { onScreenText: b.onScreenText } : {}),
    })),
    voiceover: opts.voiceover
      ? (raw.voiceover ?? []).map((l) => ({ text: (l.text ?? "").trim(), start: Number(l.start), end: Number(l.end) }))
      : [],
    musicMood: opts.music && raw.musicMood?.trim() ? raw.musicMood.trim() : null,
    assetRequests: (raw.assetRequests ?? []).slice(0, MAX_GENERATED_IMAGES).map((a, i) => ({
      id: (a.id ?? "").replace(/[^\w-]/g, "") || `img${i + 1}`,
      description: a.description ?? "",
      kind: a.kind === "illustration" || a.kind === "texture" ? a.kind : "photo",
    })),
    libraries: [...new Set((raw.libraries ?? []).filter((l): l is StudioLibrary => LIBS.includes(l)))],
  };
  if (!plan.libraries.includes("gsap")) plan.libraries.unshift("gsap");
  return normalizePlanTimings(plan, opts.cap);
}

// ─── Pipeline helpers ──────────────────────────────────────────────────────

function referenceFrom(row: StudioJobRow): ReferenceAnalysis | null {
  const a = row.reference_analysis;
  return a && !("error" in a) && "summary" in a ? (a as ReferenceAnalysis) : null;
}

export function injectStudioWatermark(html: string): string {
  return injectWatermarkOverlay(html);
}

async function fetchWebsiteText(url: string): Promise<string | null> {
  try {
    const res = await fetchPublicUrl(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 2_000_000);
    const text = html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000) || null;
  } catch {
    return null;
  }
}

async function websiteBrief(url: string): Promise<WebsiteBrief & { logoUrl: string | null }> {
  const [scraped, text] = await Promise.all([
    scrapeBrand(url).catch((err) => {
      console.warn(`[studio] brand scrape ${url} failed:`, err instanceof Error ? err.message : err);
      return null;
    }),
    fetchWebsiteText(url),
  ]);
  return {
    url,
    title: scraped?.pageTitle ?? null,
    palette: scraped?.palette ?? [],
    headlineFont: scraped?.headlineFont ?? null,
    bodyFont: scraped?.bodyFont ?? null,
    logoUrl: scraped?.logoUrl ?? null,
    text,
  };
}

function aspectFor(width: number, height: number): AspectRatio {
  const r = width / height;
  return r > 1.2 ? "16:9" : r < 0.8 ? "9:16" : "1:1";
}

async function generateImages(
  jobId: string,
  plan: StudioPlan,
  width: number,
  height: number,
): Promise<{ id: string; url: string; path: string; description: string }[]> {
  const results = await Promise.all(
    plan.assetRequests.map(async (a) => {
      try {
        const style =
          a.kind === "illustration"
            ? "clean editorial illustration"
            : a.kind === "texture"
              ? "seamless abstract texture, no text"
              : "photograph, natural light, high detail";
        const img = await runImage({
          model: FLUX_ULTRA,
          prompt: `${a.description}. ${style}. No text, no watermark, no logos.`,
          aspectRatio: aspectFor(width, height),
        });
        const mirrored = await mirrorAssetForJob(jobId, "v2", a.id, img.url);
        return { id: a.id, url: mirrored.publicUrl, path: mirrored.storagePath, description: a.description };
      } catch (err) {
        console.warn(`[studio ${jobId}] image ${a.id} failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

async function toBase64Jpeg(jpeg: Buffer, width = 768): Promise<string> {
  const sharp = (await import("sharp")).default;
  const out = await sharp(jpeg).resize({ width, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  return out.toString("base64");
}

/** One vision review pass. Returns the improved document or null to keep the current one. */
async function reviewDocument(
  html: string,
  d: DocContext,
  plan: StudioPlan | null,
  before: { errorCount: number },
): Promise<{ html: string; frames: { time: number; jpeg: Buffer }[]; score: number } | null> {
  const times = Array.from({ length: REVIEW_FRAMES }, (_, i) =>
    Math.min(d.duration - 1 / d.fps, Math.round(((i + 0.5) / REVIEW_FRAMES) * d.duration * d.fps) / d.fps),
  );
  const cap = await captureFrames(
    {
      html,
      width: d.preset.width,
      height: d.preset.height,
      fps: d.fps,
      duration: d.duration,
      seed: d.seed,
      allowedHosts: d.allowedHosts,
    },
    times,
  );
  const frames = await Promise.all(cap.frames.map(async (f) => ({ time: f.time, jpegBase64: await toBase64Jpeg(f.jpeg) })));
  const res = await callOpus<ReviewResponse>({
    system: systemFor(REVIEW_TASK),
    messages: buildReviewMessages(html, frames, { plan, preset: d.preset, duration: d.duration, fps: d.fps }),
    schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
    effort: "high",
    maxTokens: 32_000,
    reason: "opus_studio_review",
    label: "review",
  });
  const review = res.json!;
  console.log(`[studio review] verdict=${review.verdict} score=${review.score} issues=${review.issues.length}`);
  if (review.verdict !== "patch" || review.edits.length === 0) return null;
  const patched = applyPatchEdits(html, review.edits);
  if (!patched.ok) {
    console.warn(`[studio review] edit #${patched.failedIndex} ${patched.reason}; keeping the unreviewed cut`);
    return null;
  }
  const report = await validateWith(patched.html, d);
  if (hasBlockingErrors(report) || report.errors.length > before.errorCount) {
    console.warn(`[studio review] reviewed cut failed validation; keeping the unreviewed cut`);
    return null;
  }
  return { html: patched.html, frames: report.frames, score: review.score };
}

// ─── Run ───────────────────────────────────────────────────────────────────

export type RunKind = "initial" | "regenerate";

/**
 * Full generation. kind "regenerate" re-plans from the same inputs and adds
 * one revision; on failure it restores `restoreStage` instead of failing the
 * whole video.
 */
export async function runStudioJob(
  jobId: string,
  opts: { kind?: RunKind; restoreStage?: StudioStage } = {},
): Promise<void> {
  const kind = opts.kind ?? "initial";
  const initial = await getStudioJob(jobId);
  if (!initial) {
    console.error(`runStudioJob(${jobId}): job not found`);
    return;
  }
  const started = Date.now();
  await withStudioOperation(initial, async () => {
    let row = initial;
    try {
      const billing = row.user_id ? await getOrCreateBilling(row.user_id) : null;
      const features = getPlanFeatures(billing?.plan_tier ?? null);
      const record: StudioPlanRecord = row.studio_plan ?? {
        version: 1,
        input: { sources: [], useBrandKit: true, templateId: row.template_id },
        plan: null,
      };
      const target = Number(row.target_duration ?? 30);
      const cap = maxVideoDuration(target, features.maxStudioDuration);
      const fps = row.fps ?? DEFAULT_FPS;

      // 1. Reference analysis (reused on regenerate).
      let reference = referenceFrom(row);
      if (row.reference_video_url && !reference) {
        await setStage(jobId, "analyzing_reference");
        try {
          reference = await analyzeReferenceVideo(row.reference_video_url, { maxScriptChars: features.maxScriptChars });
          await updateJob(jobId, { reference_analysis: reference });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[studio ${jobId}] reference analysis failed: ${message}`);
          await updateJob(jobId, { reference_analysis: { error: message } });
        }
      }

      // Format ("match" resolves from the reference).
      const preset = resolveFormat((row.format as CreateStudioJobInput["format"]) ?? "16:9", reference);
      if (preset.width !== row.width || preset.height !== row.height) {
        await updateJob(jobId, { width: preset.width, height: preset.height });
        row = { ...row, width: preset.width, height: preset.height };
      }

      // Brand kit, website, template, locked assets.
      let brandKit: BrandKit | null = null;
      if (record.input.useBrandKit && features.brandKit && row.user_id) {
        const kit = await getBrandKit(row.user_id).catch(() => null);
        if (kit && !isBrandKitEmpty(kit)) brandKit = kit;
      }
      const websiteSrc = record.input.sources.find((s) => s.kind === "website");
      let website: WebsiteBrief | null = null;
      if (websiteSrc) {
        await setStage(jobId, "analyzing_reference");
        const w = await websiteBrief(websiteSrc.url);
        website = w;
        record.website = {
          url: w.url,
          title: w.title,
          palette: w.palette,
          headlineFont: w.headlineFont,
          bodyFont: w.bodyFont,
          logoUrl: w.logoUrl,
        };
      }
      const template = getTemplate(record.input.templateId ?? row.template_id);
      const locked: LockedAsset[] = [];
      if (brandKit?.logoUrl) locked.push({ id: "logo", url: brandKit.logoUrl, name: `${brandKit.name ?? "Brand"} logo`, role: "logo" });
      record.input.sources
        .filter((s): s is Extract<StudioSource, { kind: "image" }> => s.kind === "image")
        .forEach((s, i) => locked.push({ id: `user${i + 1}`, url: s.url, name: s.name, role: "image" }));

      // 2. Plan.
      await setStage(jobId, "planning");
      const voiceOn = !!row.voice_id && features.audio;
      const musicOn = !!row.music_enabled && features.audio;
      const planRes = await callOpus<RawPlan>({
        system: systemFor(PLAN_TASK),
        messages: buildPlanMessages({
          prompt: row.prompt || template?.prompt || "",
          preset,
          targetDuration: target,
          maxDuration: cap,
          fps,
          language: row.language ?? "en",
          voiceover: voiceOn,
          music: musicOn,
          brandKit,
          website,
          reference,
          lockedAssets: locked,
          template: template ? { name: template.name, styleNotes: template.styleNotes } : null,
        }),
        schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
        effort: "high",
        maxTokens: 32_000,
        reason: "opus_studio_plan",
        label: "plan",
      });
      const plan = normalizePlan(planRes.json!, { cap, voiceover: voiceOn, music: musicOn });
      await updateJob(jobId, {
        ...(row.title ? {} : { title: plan.title }),
        studio_plan: { ...record, plan },
      });

      // 3. Voiceover ∥ images ∥ music.
      await setStage(jobId, voiceOn && plan.voiceover.length ? "voiceover" : "assets");
      const audio: StudioAudioRecord = { voiceover: null, music: null };
      const stamp = Date.now().toString(36);
      const [vo, generated, music] = await Promise.all([
        voiceOn && plan.voiceover.length
          ? recordVoiceover({ lines: plan.voiceover.map((l) => l.text), voiceId: row.voice_id! })
          : Promise.resolve(null),
        generateImages(jobId, plan, preset.width, preset.height),
        plan.musicMood
          ? (async () => {
              const track = await pickMusicTrack(plan.musicMood!, target);
              if (!track) return null;
              const buf = await downloadAudio(track.streamUrl);
              const up = await uploadBuffer({
                storagePath: `jobs/${jobId}/v2/audio/music-${stamp}.mp3`,
                body: buf,
                contentType: "audio/mpeg",
              });
              return { url: up.publicUrl, path: up.storagePath, title: track.title, artist: track.artist, trackId: track.id };
            })().catch((err) => {
              console.warn(`[studio ${jobId}] music failed:`, err instanceof Error ? err.message : err);
              return null;
            })
          : Promise.resolve(null),
      ]);
      if (vo) {
        const up = await uploadBuffer({
          storagePath: `jobs/${jobId}/v2/audio/voiceover-${stamp}.mp3`,
          body: vo.audio,
          contentType: "audio/mpeg",
        });
        audio.voiceover = { url: up.publicUrl, path: up.storagePath, duration: vo.duration, lines: vo.lines };
        if (row.user_id) {
          void insertUserAsset({
            userId: row.user_id,
            kind: "audio",
            name: `Voiceover — ${plan.title}`,
            url: up.publicUrl,
            path: up.storagePath,
            mime: "audio/mpeg",
            bytes: vo.audio.byteLength,
            duration: vo.duration,
            source: "voiceover",
            jobId,
          }).catch(() => {});
        }
      }
      audio.music = music;

      // Timings: the recorded voiceover is the clock.
      const finalDuration = computeFinalDuration({
        planDuration: plan.duration,
        voiceover: vo?.lines ?? [],
        cap,
        fps,
      });
      const timedPlan: StudioPlan = {
        ...plan,
        duration: finalDuration,
        beats: vo
          ? remapBeats(plan.beats, plan.voiceover, vo.lines, plan.duration, finalDuration)
          : scaleBeats(plan.beats, plan.duration, finalDuration),
        voiceover: vo?.lines ?? [],
      };
      const generatedAssets: GeneratedAsset[] = generated.map((g) => ({ id: g.id, url: g.url, description: g.description }));
      await updateJob(jobId, {
        audio,
        studio_plan: { ...record, plan: timedPlan, finalDuration, generatedAssets: generated },
      });
      row = { ...row, audio, studio_plan: { ...record, plan: timedPlan, finalDuration, generatedAssets: generated } };

      // 4. Code.
      await setStage(jobId, "writing");
      const code = await callOpus({
        system: systemFor(CODE_TASK),
        messages: buildCodeMessages({
          plan: timedPlan,
          preset,
          duration: finalDuration,
          fps,
          language: row.language ?? "en",
          voiceover: timedPlan.voiceover,
          lockedAssets: locked,
          generatedAssets,
          brandKit,
          reference,
        }),
        effort: CODE_EFFORT,
        maxTokens: 80_000,
        reason: "opus_studio_code",
        label: "code",
      });
      const html = extractHtmlDocument(code.text);
      if (!html) throw new Error("The model did not return an HTML document.");

      // 5. Validate + repair.
      const d = docContextFor(row, finalDuration);
      await setStage(jobId, "validating");
      const repaired = await repairUntilValid(html, d, {
        onRound: (n) => setStage(jobId, "validating", {}, 0.55 + n * 0.04),
      });
      if (hasBlockingErrors(repaired.report)) {
        throw new Error(
          `The generated video did not pass validation: ${repaired.report.errors.map((e) => e.message).slice(0, 3).join("; ")}`,
        );
      }

      // 6. Revisions + self-review.
      let revision = await nextRevisionNumber(jobId);
      let finalHtml = repaired.html;
      let frames = repaired.report.frames;
      if (kind === "initial") {
        await saveRevision({ jobId, revision, kind: "initial", instruction: null, html: finalHtml, thumbJpeg: pickThumbFrame(frames) });
      }
      let reviewed = false;
      if (remainingBudget() >= REVIEW_MIN_BUDGET) {
        await setStage(jobId, "reviewing", kind === "initial" ? { current_revision: revision } : {});
        try {
          const r = await reviewDocument(finalHtml, d, timedPlan, { errorCount: repaired.report.errors.length });
          if (r) {
            finalHtml = r.html;
            frames = r.frames.length ? r.frames : frames;
            reviewed = true;
          }
        } catch (err) {
          console.warn(`[studio ${jobId}] review skipped:`, err instanceof Error ? err.message : err);
        }
      }
      if (kind === "initial" && reviewed) {
        revision += 1;
        await saveRevision({ jobId, revision, kind: "review", instruction: "Self-review polish", html: finalHtml, thumbJpeg: pickThumbFrame(frames) });
      } else if (kind === "regenerate") {
        await saveRevision({ jobId, revision, kind: "regenerate", instruction: null, html: finalHtml, thumbJpeg: pickThumbFrame(frames) });
      }
      await setStage(jobId, "preview_ready", { current_revision: revision, error: null });
      capture(row, "studio_preview_ready", {
        kind,
        revision,
        duration: finalDuration,
        repair_rounds: repaired.rounds,
        reviewed,
        seconds: Math.round((Date.now() - started) / 1000),
      });

      // 7. Render the MP4 with default export options.
      const watermark = await planWatermark(row.user_id);
      await renderRevisionInternal(row, revision, {
        resolution: "1080p",
        quality: "standard",
        includeSubtitles: false,
        includeVoiceover: true,
        watermark,
      }, "preview_ready");
      capture(row, "studio_job_completed", { kind, seconds: Math.round((Date.now() - started) / 1000) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[studio ${jobId}] ${kind} failed:`, message);
      if (kind === "regenerate") {
        await setStage(jobId, opts.restoreStage ?? "preview_ready", { error: `Regenerate failed: ${message}` }).catch(() => {});
      } else {
        await setStage(jobId, "failed", { error: message, completed_at: new Date().toISOString() }).catch(() => {});
      }
      capture(row, "studio_job_failed", { kind, error: message.slice(0, 300) });
    }
  });
}

// ─── Render (Export) ───────────────────────────────────────────────────────

/** Export modal entry point. The route has claimed the job (stage rendering). */
export async function runStudioRender(
  jobId: string,
  options: ExportOptions,
  restoreStage: StudioStage,
): Promise<void> {
  const row = await getStudioJob(jobId);
  if (!row) return;
  await withStudioOperation(row, async () => {
    const revision = options.revision ?? row.current_revision ?? 0;
    await renderRevisionInternal(row, revision, options, restoreStage).catch((err) =>
      console.error(`[studio ${jobId}] render failed:`, err instanceof Error ? err.message : err),
    );
  });
}

/**
 * Render → mux → upload for one revision. On failure the revision records
 * the error and the job returns to `restoreStage` (the preview still works).
 */
async function renderRevisionInternal(
  row: StudioJobRow,
  revision: number,
  options: ExportOptions,
  restoreStage: StudioStage,
): Promise<boolean> {
  const jobId = row.id;
  const rev = await getRevision(jobId, revision);
  if (!rev) throw new Error(`Revision ${revision} not found`);
  const d = docContextFor(row);
  const duration = d.duration;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `videly-render-${jobId.slice(0, 8)}-`));
  try {
    await updateRevision(jobId, revision, { render_status: "rendering", render_error: null, render_options: options });
    await setStage(jobId, "rendering");
    let html = await downloadText(rev.html_path);
    if (options.watermark) html = injectStudioWatermark(html);

    const dims = exportDimensions(d.preset, options.resolution);
    const silentPath = path.join(tmp, "silent.mp4");
    let lastWrite = 0;
    await renderVideo({
      html,
      width: d.preset.width,
      height: d.preset.height,
      fps: d.fps,
      duration,
      seed: d.seed,
      allowedHosts: d.allowedHosts,
      scale: dims.scale,
      outPath: silentPath,
      crf: QUALITY_CRF[options.quality],
      onProgress: (f) => {
        const now = Date.now();
        if (now - lastWrite < 3000) return;
        lastWrite = now;
        void setStage(jobId, "rendering", {}, 0.78 + Math.max(0, Math.min(1, f)) * 0.17).catch(() => {});
      },
    });

    await setStage(jobId, "mixing_audio");
    const audio = row.audio;
    let voPath: string | null = null;
    let musicPath: string | null = null;
    if (options.includeVoiceover && audio?.voiceover?.path) {
      voPath = path.join(tmp, "voiceover.mp3");
      await fs.writeFile(voPath, await downloadBuffer(audio.voiceover.path));
    }
    if (audio?.music?.path) {
      musicPath = path.join(tmp, "music.mp3");
      await fs.writeFile(musicPath, await downloadBuffer(audio.music.path));
    }
    const outPath = path.join(tmp, "video.mp4");
    await mixAndMux({
      videoPath: silentPath,
      outPath,
      duration,
      voiceoverPath: voPath,
      musicPath,
      subtitles: options.includeSubtitles ? (audio?.voiceover?.lines ?? null) : null,
    });

    const paths = revisionPaths(jobId, revision);
    const mp4 = await fs.readFile(outPath);
    const up = await uploadBuffer({ storagePath: paths.video, body: mp4, contentType: "video/mp4" });
    const videoUrl = `${up.publicUrl}?v=${Date.now().toString(36)}`;

    const credits = renderCredits(duration, options.resolution);
    void recordModelCost({
      provider: "videly_render",
      model: "studio-renderer",
      reason: "studio_render",
      unitKind: "seconds",
      units: Math.ceil(duration),
      costUsdMicros: credits * 1000,
      creditsCharged: credits,
      extra: { resolution: options.resolution, quality: options.quality, revision },
    });

    await updateRevision(jobId, revision, {
      render_status: "ready",
      video_path: paths.video,
      video_url: videoUrl,
      render_error: null,
    });
    await setStage(jobId, "done", {
      final_video_url: videoUrl,
      final_video_storage_path: paths.video,
      final_video_status: "ready",
      final_video_duration: duration,
      final_video_built_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error: null,
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[studio ${jobId}] render rev ${revision} failed:`, message);
    await updateRevision(jobId, revision, { render_status: "failed", render_error: message.slice(0, 1000) }).catch(() => {});
    await setStage(jobId, restoreStage).catch(() => {});
    return false;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Duplicate ─────────────────────────────────────────────────────────────

/** New job owned by the same user with a copy of the current revision (no credits). */
export async function duplicateStudioJob(row: StudioJobRow, userId: string): Promise<string> {
  const db = getSupabase();
  const current = row.current_revision ?? 0;
  const rev = current > 0 ? await getRevision(row.id, current) : null;
  const { data, error } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      generation_mode: "v2",
      status: rev ? "scenes_ready" : "failed",
      stage_label: rev ? "Preview ready" : "Failed",
      progress: rev ? 0.75 : 0,
      script: row.script ?? row.prompt ?? "",
      prompt: row.prompt,
      title: `${row.title ?? "Untitled video"} (copy)`.slice(0, 120),
      format: row.format,
      width: row.width,
      height: row.height,
      fps: row.fps,
      target_duration: row.target_duration,
      language: row.language,
      voice_id: row.voice_id,
      voiceover_enabled: row.voiceover_enabled,
      music_enabled: row.music_enabled,
      template_id: row.template_id,
      seed: row.seed,
      studio_plan: row.studio_plan,
      audio: null,
      current_revision: rev ? 1 : 0,
      reference_video_url: row.reference_video_url,
      reference_analysis: row.reference_analysis,
      director_model: STUDIO_MODEL,
      error: rev ? null : "Nothing to duplicate yet",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`duplicate insert failed: ${error?.message ?? "no row"}`);
  const newId = data.id as string;
  const bucket = db.storage.from(STORYBOARDS_BUCKET);

  // Audio files are copied so deleting the original never breaks the copy.
  const audio = row.audio;
  if (audio) {
    const copied: StudioAudioRecord = { voiceover: null, music: null };
    if (audio.voiceover) {
      const to = `jobs/${newId}/v2/audio/voiceover.mp3`;
      const { error: e } = await bucket.copy(audio.voiceover.path, to);
      if (!e) copied.voiceover = { ...audio.voiceover, path: to, url: publicUrl(to)! };
    }
    if (audio.music?.path) {
      const to = `jobs/${newId}/v2/audio/music.mp3`;
      const { error: e } = await bucket.copy(audio.music.path, to);
      if (!e) copied.music = { ...audio.music, path: to, url: publicUrl(to)! };
    }
    await updateJob(newId, { audio: copied });
  }
  if (rev) {
    const to = revisionPaths(newId, 1);
    const { error: e1 } = await bucket.copy(rev.html_path, to.html);
    if (e1) throw new Error(`duplicate copy failed: ${e1.message}`);
    let thumb: string | null = null;
    if (rev.thumb_path && !(await bucket.copy(rev.thumb_path, to.thumb)).error) thumb = to.thumb;
    const { error: e2 } = await db.from("job_revisions").insert({
      job_id: newId,
      revision: 1,
      kind: "initial",
      instruction: `Duplicated from revision ${rev.revision}`,
      html_path: to.html,
      thumb_path: thumb,
    });
    if (e2) throw new Error(`duplicate revision insert failed: ${e2.message}`);
  }
  return newId;
}

// ─── Timeline strip ────────────────────────────────────────────────────────

export function timelineTimes(duration: number, count: number, fps = DEFAULT_FPS): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.min(duration - 1 / fps, Math.round(((i + 0.5) / count) * duration * fps) / fps),
  );
}

export async function studioTimeline(
  row: StudioJobRow,
  revision: number,
  count: number,
): Promise<{ time: number; url: string }[]> {
  const rev = await getRevision(row.id, revision);
  if (!rev) throw new Error("Revision not found");
  const d = docContextFor(row);
  const times = timelineTimes(d.duration, count, d.fps);
  const dir = `${revisionPaths(row.id, revision).dir}/timeline`;
  const names = times.map((_, i) => `${count}-${i}.jpg`);
  const bucket = getSupabase().storage.from(STORYBOARDS_BUCKET);
  const { data: existing } = await bucket.list(dir, { limit: 1000 });
  const have = new Set((existing ?? []).map((e) => e.name));
  if (!names.every((n) => have.has(n))) {
    const html = await downloadText(rev.html_path);
    const cap = await captureFrames(
      {
        html,
        width: d.preset.width,
        height: d.preset.height,
        fps: d.fps,
        duration: d.duration,
        seed: d.seed,
        allowedHosts: d.allowedHosts,
      },
      times,
    );
    const sharp = (await import("sharp")).default;
    await Promise.all(
      cap.frames.map(async (f, i) => {
        const small = await sharp(f.jpeg).resize({ height: 180 }).jpeg({ quality: 72 }).toBuffer();
        await uploadBuffer({ storagePath: `${dir}/${names[i]}`, body: small, contentType: "image/jpeg" });
      }),
    );
  }
  return times.map((time, i) => ({ time, url: publicUrl(`${dir}/${names[i]}`)! }));
}

