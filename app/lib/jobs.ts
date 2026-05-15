import {
  DEFAULT_FILM_MODE,
  DIRECTOR_MODEL,
  FILM_MODES,
  generateStoryboard as generateLegacyStoryboard,
  isSupportedFilmMode,
  MAX_SHOTS,
  type Continuity,
  type FilmMode,
  type ShotRecipe,
} from "./director";
import {
  assembleShotPrompts,
  deriveDepthCue,
  deriveLightingTag,
  deriveShotType,
  deriveSubject,
  deriveUiDensity,
  deriveUiDescription,
  lintStoryboard,
  reinforceImagePrompt,
} from "./prompt-engine";
import {
  summarizeValidation,
  validateGeneratedImage,
} from "./vision-validator";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  isSupportedImageModel,
  isSupportedVideoModel,
  runImage,
  runVideo,
  runWithConcurrency,
  type ImageModel,
  type VideoModel,
} from "./replicate";
import {
  mirrorImage,
  mirrorVideo,
  removeJobAssets,
  uploadSceneAsset,
} from "./storage";
import { getSupabase, type JobRow, type ShotRow } from "./supabase";
import {
  generateFilmHTML,
  generateStoryboard,
  type StoryboardScene,
} from "./hyperframes/llm-director";
import { renderScene } from "./hyperframes/render";
import { captureSceneThumbnail } from "./hyperframes/thumbnail";

type AssembledShot = ShotRecipe & {
  imagePrompt: string;
  videoPrompt: string;
  negativePrompt: string;
};

function joinPalette(palette: string[]): string {
  return palette
    .map((c) => (c.startsWith("#") ? c : `#${c}`))
    .join(", ");
}

const IMAGE_CONCURRENCY = 2;
export const MAX_SHOTS_PER_JOB = MAX_SHOTS;

export type CreateJobInput = {
  script: string;
  productDescription?: string;
  brandStyle?: string;
  brandLogoUrl?: string | null;
  brandLogoStoragePath?: string | null;
  brandColors?: string[] | null;
  userId?: string | null;
};

export async function createJob(input: CreateJobInput): Promise<{ jobId: string }> {
  const script = input.script.trim();
  if (!script) throw new Error("Script is required");

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .insert({
      script,
      product_description: input.productDescription?.trim() || null,
      brand_style: input.brandStyle?.trim() || null,
      brand_logo_url: input.brandLogoUrl ?? null,
      brand_logo_storage_path: input.brandLogoStoragePath ?? null,
      brand_colors:
        input.brandColors && input.brandColors.length > 0
          ? input.brandColors
          : null,
      director_model: DIRECTOR_MODEL,
      status: "pending",
      user_id: input.userId ?? null,
      generation_mode: "hyperframes",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createJob failed: ${error?.message ?? "no row returned"}`);
  }
  return { jobId: data.id as string };
}

export type UpdateJobBrandInput = {
  brandLogoUrl?: string | null;
  brandLogoStoragePath?: string | null;
  brandColors?: string[] | null;
};

export async function updateJobBrand(
  jobId: string,
  userId: string,
  input: UpdateJobBrandInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.brandLogoUrl !== undefined) patch.brand_logo_url = input.brandLogoUrl;
  if (input.brandLogoStoragePath !== undefined) {
    patch.brand_logo_storage_path = input.brandLogoStoragePath;
  }
  if (input.brandColors !== undefined) {
    patch.brand_colors =
      input.brandColors && input.brandColors.length > 0 ? input.brandColors : null;
  }
  if (Object.keys(patch).length === 0) return;

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw new Error(`updateJobBrand(${jobId}) failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }
}

export type JobSfx = {
  sfxId: string;
  name: string;
  author: string;
  previewUrl: string;
  license: string;
};

export async function updateJobSfx(
  jobId: string,
  userId: string,
  sfx: JobSfx | null,
): Promise<void> {
  const patch = sfx
    ? {
        sfx_id: sfx.sfxId,
        sfx_name: sfx.name,
        sfx_author: sfx.author,
        sfx_url: sfx.previewUrl,
        sfx_license: sfx.license,
      }
    : {
        sfx_id: null,
        sfx_name: null,
        sfx_author: null,
        sfx_url: null,
        sfx_license: null,
      };

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw new Error(`updateJobSfx(${jobId}) failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }
}

export type JobMusic = {
  trackId: string;
  title: string;
  artist: string;
  streamUrl: string;
};

export async function updateJobMusic(
  jobId: string,
  userId: string,
  music: JobMusic | null,
): Promise<void> {
  const patch = music
    ? {
        music_track_id: music.trackId,
        music_title: music.title,
        music_artist: music.artist,
        music_url: music.streamUrl,
      }
    : {
        music_track_id: null,
        music_title: null,
        music_artist: null,
        music_url: null,
      };

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw new Error(`updateJobMusic(${jobId}) failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }
}

async function setJobStatus(
  jobId: string,
  patch: Partial<
    Pick<
      JobRow,
      | "status"
      | "title"
      | "shot_count"
      | "error"
      | "director_raw"
      | "continuity"
      | "completed_at"
    >
  >,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from("jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`updateJob(${jobId}) failed: ${error.message}`);
}

async function insertShots(jobId: string, shots: AssembledShot[]): Promise<ShotRow[]> {
  const db = getSupabase();
  const rows = shots.map((s, i) => ({
    job_id: jobId,
    shot_index: i,
    duration: s.duration,
    narration_part: s.narrationPart,
    shot_goal: s.shotGoal,
    image_prompt: s.imagePrompt,
    video_prompt: s.videoPrompt,
    negative_prompt: s.negativePrompt,
    composition: s.grounding.composition.layout,
    focal_point: s.grounding.composition.primaryFocus,
    camera_motion: s.grounding.camera.motion,
    lighting: deriveLightingTag(s),
    transition_out: s.transitionOut,
    ui_density: deriveUiDensity(s),
    text_overlay: s.textOverlay,
    color_palette: joinPalette(s.colorPalette),
    shot_type: deriveShotType(s),
    subject: deriveSubject(s),
    ui_description: deriveUiDescription(s),
    ui_motion: s.uiMotion,
    lighting_motion: s.lightingMotion,
    depth_cue: deriveDepthCue(s),
    atmosphere: s.atmosphere,
    pacing: s.pacing,
    intent: s.intent,
    domain: s.domain,
    grounding: s.grounding as unknown as object,
    visual_anchors: s.visualAnchors as unknown as object,
    motion_anchors: s.motion as unknown as object,
    style_notes: s.styleNotes,
    status: "pending" as const,
    clip_status: "skipped" as const,
  }));

  const { data, error } = await db.from("shots").insert(rows).select("*");
  if (error || !data) {
    throw new Error(`insertShots failed: ${error?.message ?? "no rows returned"}`);
  }
  return data as ShotRow[];
}

function assembleShots(
  recipes: ShotRecipe[],
  continuity: Continuity,
  mode: FilmMode,
): AssembledShot[] {
  return recipes.map((recipe) => {
    const prompts = assembleShotPrompts(recipe, continuity, mode);
    return { ...recipe, ...prompts };
  });
}

function resolveFilmMode(job: JobRow): FilmMode {
  if (job.film_mode && isSupportedFilmMode(job.film_mode)) {
    return job.film_mode;
  }
  return DEFAULT_FILM_MODE;
}

async function patchShot(
  shotId: string,
  patch: Partial<ShotRow>,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from("shots").update(patch).eq("id", shotId);
  if (error) {
    console.error(`patchShot(${shotId}) failed:`, error.message);
  }
}

type RenderAttempt = {
  replicateUrl: string;
  mirroredUrl: string;
  storagePath: string | null;
  replicateId: string | null;
};

async function renderAndMirror(args: {
  prompt: string;
  negativePrompt: string | null;
  imageModel: ImageModel;
  jobId: string;
  shotIndex: number;
}): Promise<RenderAttempt> {
  const result = await runImage({
    model: args.imageModel,
    prompt: args.prompt,
    negativePrompt: args.negativePrompt ?? undefined,
    aspectRatio: "16:9",
  });
  let mirroredUrl = result.url;
  let storagePath: string | null = null;
  try {
    const m = await mirrorImage(args.jobId, args.shotIndex, result.url);
    mirroredUrl = m.publicUrl;
    storagePath = m.storagePath;
  } catch (mirrorErr) {
    console.error(
      `mirrorImage failed for shot ${args.shotIndex} of job ${args.jobId}; using Replicate URL:`,
      mirrorErr instanceof Error ? mirrorErr.message : mirrorErr,
    );
  }
  return {
    replicateUrl: result.url,
    mirroredUrl,
    storagePath,
    replicateId: result.replicateId,
  };
}

async function renderImageStep(args: {
  shot: ShotRow;
  jobId: string;
  imageModel: ImageModel;
}): Promise<{ imageUrl: string | null; storagePath: string | null }> {
  const { shot, jobId, imageModel } = args;
  await patchShot(shot.id, { status: "generating", error: null });

  try {
    const requiresUi =
      shot.ui_density !== null &&
      shot.ui_density !== "none" &&
      shot.domain !== "no_ui_cinematic";

    // Resolve mode for this job (needed for validator).
    const { data: jobData } = await getSupabase()
      .from("jobs")
      .select("film_mode")
      .eq("id", jobId)
      .maybeSingle();
    const filmMode: FilmMode =
      jobData?.film_mode && isSupportedFilmMode(jobData.film_mode)
        ? (jobData.film_mode as FilmMode)
        : DEFAULT_FILM_MODE;

    // Attempt 1 — original prompt. Legacy AI-media shots always have an
    // image_prompt set during assembleShots; the column is only nullable
    // because hyperframes scenes share the table.
    if (!shot.image_prompt) {
      throw new Error(`legacy image render: shot ${shot.id} has no image_prompt`);
    }
    const first = await renderAndMirror({
      prompt: shot.image_prompt,
      negativePrompt: shot.negative_prompt,
      imageModel,
      jobId,
      shotIndex: shot.shot_index,
    });

    let firstValidation;
    try {
      firstValidation = await validateGeneratedImage({
        imageUrl: first.mirroredUrl,
        requiresUi,
        mode: filmMode,
      });
    } catch (err) {
      console.error(
        `validator failed for shot ${shot.id}; accepting first attempt:`,
        err instanceof Error ? err.message : err,
      );
      firstValidation = null;
    }

    let chosen = first;
    let chosenValidation = firstValidation;
    let attempts = 1;

    if (firstValidation && !firstValidation.approved) {
      console.warn(
        `shot ${shot.id} validation failed: ${summarizeValidation(firstValidation)} — retrying with reinforced prompt`,
      );
      const reinforced = reinforceImagePrompt(shot.image_prompt!);
      try {
        const second = await renderAndMirror({
          prompt: reinforced,
          negativePrompt: shot.negative_prompt,
          imageModel,
          jobId,
          shotIndex: shot.shot_index,
        });
        attempts = 2;
        let secondValidation;
        try {
          secondValidation = await validateGeneratedImage({
            imageUrl: second.mirroredUrl,
            requiresUi,
            mode: filmMode,
          });
        } catch (err) {
          console.error(
            `validator failed on retry for shot ${shot.id}:`,
            err instanceof Error ? err.message : err,
          );
          secondValidation = null;
        }
        // Prefer the approved attempt; otherwise prefer the one with fewer reasons.
        if (
          secondValidation?.approved ||
          (secondValidation && firstValidation && secondValidation.reasons.length < firstValidation.reasons.length)
        ) {
          chosen = second;
          chosenValidation = secondValidation;
        }
      } catch (retryErr) {
        console.error(
          `retry render failed for shot ${shot.id}; keeping first attempt:`,
          retryErr instanceof Error ? retryErr.message : retryErr,
        );
      }
    }

    await patchShot(shot.id, {
      status: "ready",
      image_url: chosen.mirroredUrl,
      storage_path: chosen.storagePath,
      replicate_id: chosen.replicateId,
      validation_passed: chosenValidation ? chosenValidation.approved : null,
      validation_warnings: chosenValidation
        ? chosenValidation.approved
          ? null
          : summarizeValidation(chosenValidation)
        : null,
      validation_attempts: attempts,
    });
    return { imageUrl: chosen.mirroredUrl, storagePath: chosen.storagePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`shot ${shot.id} image render failed:`, message);
    await patchShot(shot.id, {
      status: "failed",
      error: message,
      clip_status: "skipped",
      clip_error: "Image render failed; clip skipped",
    });
    return { imageUrl: null, storagePath: null };
  }
}

async function renderClipStep(args: {
  shot: ShotRow;
  jobId: string;
  videoModel: VideoModel;
  imageUrl: string;
}): Promise<void> {
  const { shot, jobId, videoModel, imageUrl } = args;
  await patchShot(shot.id, {
    clip_status: "generating",
    clip_error: null,
    clip_started_at: new Date().toISOString(),
  });

  try {
    // Snap shot.duration to nearest supported video duration (5 or 10).
    const durationSeconds: 5 | 10 = Number(shot.duration) > 7.5 ? 10 : 5;
    const result = await runVideo({
      model: videoModel,
      prompt: shot.video_prompt || shot.shot_goal || shot.image_prompt || "",
      imageUrl,
      negativePrompt: shot.negative_prompt ?? undefined,
      durationSeconds,
      aspectRatio: "16:9",
    });

    let clipUrl = result.url;
    let clipStoragePath: string | null = null;
    try {
      const mirrored = await mirrorVideo(jobId, shot.shot_index, result.url);
      clipUrl = mirrored.publicUrl;
      clipStoragePath = mirrored.storagePath;
    } catch (mirrorErr) {
      console.error(
        `mirrorVideo failed for shot ${shot.id}; using Replicate URL:`,
        mirrorErr instanceof Error ? mirrorErr.message : mirrorErr,
      );
    }

    await patchShot(shot.id, {
      clip_status: "ready",
      clip_url: clipUrl,
      clip_storage_path: clipStoragePath,
      clip_replicate_id: result.replicateId,
      clip_started_at: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`shot ${shot.id} clip render failed:`, message);
    await patchShot(shot.id, {
      clip_status: "failed",
      clip_error: message,
      clip_started_at: null,
    });
  }
}

async function renderShotPipeline(args: {
  shot: ShotRow;
  jobId: string;
  imageModel: ImageModel;
}): Promise<void> {
  // v2: image-only by default. Clips are opt-in per shot via the
  // /api/shots/:id/clip endpoint.
  await renderImageStep(args);
}

export async function runJob(jobId: string): Promise<void> {
  const db = getSupabase();

  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobErr || !jobData) {
    console.error(`runJob(${jobId}) could not load job:`, jobErr?.message);
    return;
  }
  const job = jobData as JobRow;

  try {
    if (job.generation_mode === "legacy_ai_media") {
      await runLegacyAiMediaJob(jobId, job);
    } else {
      await runHyperframesDirect(jobId, job);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`runJob(${jobId}) failed:`, message);
    await setJobStatus(jobId, {
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    }).catch((statusErr) =>
      console.error(`runJob(${jobId}) could not record failure:`, statusErr),
    );
  }
}

// ─── HyperFrames branch (default) ─────────────────────────────────────────
// Split pipeline:
//   Stage A (runHyperframesDirect): script → storyboard → ONE composition HTML.
//     Per-shot rows are inserted with the composition's public URL on every row,
//     plus a per-scene thumbnail captured by seeking the master timeline.
//     Reaches `scenes_ready` and pauses for user review.
//   Stage B (runHyperframesExport): single renderScene call → one MP4.
//     Triggered by POST /api/jobs/:id/export → runs to `completed`.

async function runHyperframesDirect(jobId: string, job: JobRow): Promise<void> {
  // Stage 1 — directing: LLM splits script into scenes + locks identity.
  // Brand hints from the job row anchor the LLM's identity choices and
  // post-parse override the accent palette / inject the logo URL.
  await setJobStatus(jobId, { status: "directing" });
  const storyboard = await generateStoryboard(job.script, {
    colors: job.brand_colors ?? null,
    logoUrl: job.brand_logo_url ?? null,
    brandStyle: job.brand_style ?? null,
  });
  console.log(
    `[hyperframes ${jobId}] storyboard: "${storyboard.title}" — ${storyboard.scenes.length} scenes` +
      (job.brand_colors?.length
        ? ` · brand colors=${job.brand_colors.join(",")}`
        : "") +
      (job.brand_logo_url ? ` · brand logo` : ""),
  );

  await setJobStatus(jobId, {
    title: storyboard.title,
    shot_count: storyboard.scenes.length,
    director_raw: storyboard as unknown as object,
  });

  console.log(
    `[hyperframes ${jobId}] visual identity: ${storyboard.visualIdentity.paletteName} · ${storyboard.visualIdentity.motionLanguage} · ${storyboard.visualIdentity.headlineFont}/${storyboard.visualIdentity.bodyFont} · lang=${storyboard.visualIdentity.language} dir=${storyboard.visualIdentity.textDirection}`,
  );

  const insertedScenes = await insertHyperframesScenes(jobId, storyboard.scenes);
  insertedScenes.sort((a, b) => a.shot_index - b.shot_index);

  // Stage 2 — generating_scenes: ONE LLM call returns FilmFills JSON; merger
  // builds a lint-clean composition HTML containing all N scenes on one
  // GSAP timeline.
  await setJobStatus(jobId, { status: "generating_scenes" });
  console.log(`[hyperframes ${jobId}] generating film fills (1 call, all ${storyboard.scenes.length} scenes)`);
  const { html } = await generateFilmHTML(storyboard, storyboard.visualIdentity);

  // Upload the single composition.html. Every shot row points at the same
  // public URL — keeps the schema unchanged and lets /api/shots/:id/scene-html
  // continue to work for editor previews.
  const compositionAsset = await uploadSceneAsset({
    jobId,
    sceneId: "main",
    filename: "composition.html",
    body: Buffer.from(html, "utf8"),
    contentType: "text/html; charset=utf-8",
  });

  // Per-scene thumbnails — seek the master timeline at each scene's midpoint
  // and screenshot. Best-effort: a failed capture leaves the iframe fallback
  // in place.
  let cumulativeOffset = 0;
  for (let i = 0; i < storyboard.scenes.length; i++) {
    const scene = storyboard.scenes[i];
    const shot = insertedScenes[i];
    const seekSeconds = cumulativeOffset + Math.min(scene.durationSeconds / 2, scene.durationSeconds - 0.1);
    cumulativeOffset += scene.durationSeconds;

    await patchShot(shot.id, { scene_html_path: compositionAsset.publicUrl });

    try {
      const png = await captureSceneThumbnail({
        html,
        durationSeconds: cumulativeOffset, // total film duration
        seekSeconds,
      });
      const thumb = await uploadSceneAsset({
        jobId,
        sceneId: scene.id,
        filename: "thumbnail.png",
        body: png,
        contentType: "image/png",
      });
      await patchShot(shot.id, { scene_thumbnail_path: thumb.publicUrl });
    } catch (thumbErr) {
      console.warn(
        `[hyperframes ${jobId}] thumbnail capture failed for ${scene.id} (seek=${seekSeconds.toFixed(2)}s):`,
        thumbErr instanceof Error ? thumbErr.message : thumbErr,
      );
    }
  }

  await setJobStatus(jobId, { status: "scenes_ready" });
}

async function runHyperframesExport(jobId: string): Promise<void> {
  const db = getSupabase();

  // Reload shots — every row's scene_html_path points at the same composition.
  const { data: shotsData, error: shotsErr } = await db
    .from("shots")
    .select("*")
    .eq("job_id", jobId)
    .order("shot_index", { ascending: true });
  if (shotsErr || !shotsData) {
    throw new Error(`runHyperframesExport(${jobId}) load shots failed: ${shotsErr?.message}`);
  }
  const shots = shotsData as ShotRow[];
  if (shots.length === 0) {
    throw new Error(`runHyperframesExport(${jobId}): no shots to render`);
  }

  const compositionUrl = shots[0].scene_html_path;
  if (!compositionUrl) {
    throw new Error(`runHyperframesExport(${jobId}): composition URL missing on shots`);
  }

  // Stage 3 — rendering_scenes (single render of the master composition).
  await setJobStatus(jobId, { status: "rendering_scenes" });
  for (const shot of shots) {
    await patchShot(shot.id, { render_status: "generating", error: null });
  }

  let result;
  try {
    const html = await fetchSceneHTML(compositionUrl);
    result = await renderScene({
      jobId,
      sceneId: "main",
      files: { html, css: "", js: "" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    for (const shot of shots) {
      await patchShot(shot.id, { render_status: "failed", status: "failed", error: message });
    }
    throw err;
  }

  // Every shot row gets the same rendered_video_url so the editor's per-scene
  // tiles play the same film (seeking is the editor's job).
  for (const shot of shots) {
    await patchShot(shot.id, {
      rendered_video_url: result.mp4.publicUrl,
      render_status: "ready",
      render_duration_ms: result.durationMs,
      status: "ready",
    });
  }

  await setJobStatus(jobId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
}

async function fetchSceneHTML(sceneHtmlUrl: string | null): Promise<string> {
  if (!sceneHtmlUrl) throw new Error("scene_html_path is null — Direct Storyboard never ran?");
  // scene_html_path now stores the Supabase public URL directly.
  const res = await fetch(sceneHtmlUrl);
  if (!res.ok) {
    throw new Error(`fetchSceneHTML(${sceneHtmlUrl}) failed: ${res.status}`);
  }
  return await res.text();
}

// Public — called by /api/jobs/:id/export.
export async function exportJob(jobId: string): Promise<void> {
  try {
    await runHyperframesExport(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`exportJob(${jobId}) failed:`, message);
    await setJobStatus(jobId, {
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    }).catch((statusErr) =>
      console.error(`exportJob(${jobId}) could not record failure:`, statusErr),
    );
    throw err;
  }
}

async function insertHyperframesScenes(
  jobId: string,
  scenes: StoryboardScene[],
): Promise<ShotRow[]> {
  const db = getSupabase();
  const rows = scenes.map((s, i) => ({
    job_id: jobId,
    shot_index: i,
    duration: s.durationSeconds,
    narration_part: s.copy,
    shot_goal: s.copy,
    image_prompt: null,
    status: "pending" as const,
    clip_status: "skipped" as const,
    render_status: "pending",
    scene_intent: null,
  }));
  const { data, error } = await db.from("shots").insert(rows).select("*");
  if (error || !data) {
    throw new Error(
      `insertHyperframesScenes failed: ${error?.message ?? "no rows returned"}`,
    );
  }
  return data as ShotRow[];
}

// ─── Legacy AI-media branch (only for existing rows with that mode set) ───

async function runLegacyAiMediaJob(jobId: string, job: JobRow): Promise<void> {
  await setJobStatus(jobId, { status: "directing" });

  const filmMode = resolveFilmMode(job);

  const directorResult = await generateLegacyStoryboard({
    script: job.script,
    productDescription: job.product_description ?? undefined,
    brandStyle: job.brand_style ?? undefined,
    filmMode,
  });

  const trimmedRecipes = directorResult.storyboard.shots.slice(0, MAX_SHOTS_PER_JOB);
  const continuity = directorResult.storyboard.continuity;

  const lint = lintStoryboard(trimmedRecipes);
  if (lint.warnings.length) {
    console.warn(`director lint(${jobId}):`, lint.warnings.join(" | "));
  }

  const assembled = assembleShots(trimmedRecipes, continuity, filmMode);

  await setJobStatus(jobId, {
    title: directorResult.storyboard.title,
    shot_count: assembled.length,
    director_raw: directorResult.raw as object,
    continuity: continuity as unknown as object,
  });

  const insertedShots = await insertShots(jobId, assembled);
  insertedShots.sort((a, b) => a.shot_index - b.shot_index);

  await setJobStatus(jobId, { status: "rendering" });

  const imageModel: ImageModel =
    job.image_model && isSupportedImageModel(job.image_model)
      ? job.image_model
      : DEFAULT_IMAGE_MODEL;

  const tasks = insertedShots.map(
    (shot) => () => renderShotPipeline({ shot, jobId, imageModel }),
  );

  await runWithConcurrency(tasks, IMAGE_CONCURRENCY);

  await setJobStatus(jobId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
}

async function loadShotAndJob(shotId: string): Promise<{ shot: ShotRow; job: JobRow }> {
  const db = getSupabase();

  const { data: shotData, error: shotErr } = await db
    .from("shots")
    .select("*")
    .eq("id", shotId)
    .single();
  if (shotErr || !shotData) {
    throw new Error(`shot ${shotId} not found`);
  }
  const shot = shotData as ShotRow;

  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", shot.job_id)
    .single();
  if (jobErr || !jobData) {
    throw new Error(`parent job ${shot.job_id} not found`);
  }
  return { shot, job: jobData as JobRow };
}

async function settleJobIfIdle(jobId: string): Promise<void> {
  const db = getSupabase();
  const { count: inFlight } = await db
    .from("shots")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .or("status.in.(pending,generating),clip_status.in.(pending,generating)");

  if ((inFlight ?? 0) === 0) {
    await setJobStatus(jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  }
}

export async function retryShot(shotId: string): Promise<void> {
  const { shot, job } = await loadShotAndJob(shotId);

  const imageModel: ImageModel =
    job.image_model && isSupportedImageModel(job.image_model)
      ? job.image_model
      : DEFAULT_IMAGE_MODEL;

  await setJobStatus(job.id, { status: "rendering" });
  await renderShotPipeline({ shot, jobId: job.id, imageModel });
  await settleJobIfIdle(job.id);
}

export async function generateClip(shotId: string): Promise<void> {
  const { shot, job } = await loadShotAndJob(shotId);

  if (!shot.image_url || shot.status !== "ready") {
    throw new Error("Image must be ready before generating a clip");
  }

  const videoModel: VideoModel =
    job.video_model && isSupportedVideoModel(job.video_model)
      ? job.video_model
      : DEFAULT_VIDEO_MODEL;

  await setJobStatus(job.id, { status: "rendering" });
  await renderClipStep({
    shot,
    jobId: job.id,
    videoModel,
    imageUrl: shot.image_url,
  });
  await settleJobIfIdle(job.id);
}

// Clip generation runs as a fire-and-forget promise inside the same Node
// process as the API route (`void generateClip(id).catch(...)`). If the dev
// server restarts or the process dies before renderClipStep's terminal
// patchShot call, the row is left with clip_status='generating' forever and
// the editor's polling UI spins forever. This reaper detects and clears those
// orphans on every getJob() call (i.e. every 2s poll).
const CLIP_ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;

async function reapOrphanedClips(jobId: string): Promise<number> {
  const cutoff = new Date(Date.now() - CLIP_ORPHAN_TIMEOUT_MS).toISOString();
  const db = getSupabase();
  const { data, error } = await db
    .from("shots")
    .update({
      clip_status: "skipped",
      clip_error:
        "Clip generation interrupted (server restart or crash). Click retry to regenerate.",
      clip_started_at: null,
    })
    .eq("job_id", jobId)
    .eq("clip_status", "generating")
    .or(`clip_started_at.lt.${cutoff},clip_started_at.is.null`)
    .select("id");
  if (error) {
    console.warn(`reapOrphanedClips(${jobId}) failed:`, error.message);
    return 0;
  }
  const n = data?.length ?? 0;
  if (n > 0) {
    console.log(`reapOrphanedClips(${jobId}) reset ${n} orphaned clip(s)`);
  }
  return n;
}

export async function getJob(
  jobId: string,
): Promise<{ job: JobRow; shots: ShotRow[] } | null> {
  const db = getSupabase();
  const [{ data: job, error: jobErr }, { data: shots, error: shotsErr }] = await Promise.all([
    db.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    db.from("shots").select("*").eq("job_id", jobId).order("shot_index", { ascending: true }),
  ]);
  if (jobErr) throw new Error(`getJob failed: ${jobErr.message}`);
  if (!job) return null;
  if (shotsErr) throw new Error(`getJob shots failed: ${shotsErr.message}`);

  // Legacy clip reaper only matters for legacy_ai_media jobs; hyperframes
  // jobs don't use the clip lifecycle. Skipping the reaper there silences
  // the schema-cache warning that fires on every poll.
  if ((job as JobRow).generation_mode === "legacy_ai_media") {
    await reapOrphanedClips(jobId).catch(() => {});
  }

  return { job: job as JobRow, shots: (shots ?? []) as ShotRow[] };
}

export type ProjectSummary = {
  id: string;
  title: string | null;
  status: string;
  filmMode: string | null;
  shotCount: number;
  readyClips: number;
  finalVideoStatus: string | null;
  finalVideoUrl: string | null;
  finalVideoDuration: number | null;
  thumbnailUrl: string | null;
  updatedAt: string;
  createdAt: string;
};

export async function deleteJob(jobId: string, userId: string): Promise<void> {
  const db = getSupabase();
  // Scope by user_id so a stolen/guessed id cannot delete another user's job.
  // Shots are removed via `on delete cascade` on shots.job_id.
  const { data, error } = await db
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(`deleteJob(${jobId}) failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }

  // Storage cleanup is best-effort: the DB row is already gone, so a failure
  // here just leaves orphaned files (cost only, no broken UX). We log but
  // don't throw so the user sees the delete succeed.
  try {
    const removed = await removeJobAssets(jobId);
    console.log(`[deleteJob] ${jobId} → removed ${removed} storage object(s)`);
  } catch (err) {
    console.warn(
      `[deleteJob] ${jobId} storage cleanup failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const db = getSupabase();
  const { data: jobs, error } = await db
    .from("jobs")
    .select(
      "id, title, status, film_mode, final_video_status, final_video_url, final_video_duration, shot_count, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(`listProjectsForUser failed: ${error.message}`);
  if (!jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id as string);
  const { data: thumbs, error: shotErr } = await db
    .from("shots")
    .select("job_id, shot_index, image_url, scene_thumbnail_path, clip_status")
    .in("job_id", jobIds);
  if (shotErr) throw new Error(`listProjectsForUser thumb fetch failed: ${shotErr.message}`);

  // Prefer the hyperframes scene thumbnail (default pipeline) and fall back to
  // the legacy AI-media image_url so older jobs still get a cover.
  const firstByJob = new Map<string, string | null>();
  const readyClipsByJob = new Map<string, number>();
  for (const row of thumbs ?? []) {
    const jid = row.job_id as string;
    if (!firstByJob.has(jid) && row.shot_index === 0) {
      const sceneThumb = row.scene_thumbnail_path as string | null;
      const legacyImg = row.image_url as string | null;
      firstByJob.set(jid, sceneThumb ?? legacyImg ?? null);
    }
    if (row.clip_status === "ready") {
      readyClipsByJob.set(jid, (readyClipsByJob.get(jid) ?? 0) + 1);
    }
  }

  return jobs.map((j) => ({
    id: j.id as string,
    title: (j.title as string | null) ?? null,
    status: j.status as string,
    filmMode: (j.film_mode as string | null) ?? null,
    shotCount: (j.shot_count as number | null) ?? 0,
    readyClips: readyClipsByJob.get(j.id as string) ?? 0,
    finalVideoStatus: (j.final_video_status as string | null) ?? null,
    finalVideoUrl: (j.final_video_url as string | null) ?? null,
    finalVideoDuration: (j.final_video_duration as number | null) ?? null,
    thumbnailUrl: firstByJob.get(j.id as string) ?? null,
    updatedAt: j.updated_at as string,
    createdAt: j.created_at as string,
  }));
}
