# MotionGlass Plan

Living roadmap of in-flight work. Update after every planning decision or sprint completion.

---

## Hotfix — Hyperframes Wall-Time (2026-05-18)

**Goal:** A representative 7-scene `runHyperframesDirect` run was taking 16.7 min (1000s); 85% in `film_html`. Target: ~3–4 min total, no model changes, architecture frozen. Plan: `C:\Users\User\.claude\plans\supabase-connected-via-vivid-barto.md`.

**What shipped (4 commits, fb63c09 → 47bb975):**

- **audio-resolver concurrency cap.** `app/lib/audio-resolver.ts` — voiceover loop was `Promise.all` on all N scenes; ElevenLabs PAYG 6-concurrent cap caused 429s. Routed through existing `runWithConcurrency` (`app/lib/replicate.ts:299`) with `ELEVENLABS_VO_CONCURRENCY` default 5 (env-tunable).
- **Scene-fill: one parallel wave.** `generateScenesWithContinuity` (`app/lib/hyperframes/llm-director.ts`) replaced its scene-1-solo + groups-of-2 loop with a single `Promise.all` over all N scenes. Each scene sees `prevSceneIntentFallback` (blueprint-level intent for predecessor) instead of real structured continuity. For N=7 this collapses 4 sequential Opus waves into 1. **Explicitly overrides the saved `scene-continuity-contract` memory** per user decision today; revert this single commit (`12e8953`) if hand-offs feel broken in practice.
- **Scene-fill: effort kept at high.** Initially dropped `effort: "high"` → `"medium"` for speed, but the 2026-05-19 run produced sparse 2–7K-token scenes that "looked broken" — too tight to express the motion mandates. Reverted to `effort: "high"` (commit `017d207`) while keeping the length-budget block and 1-wave parallelism. Expected ~5–6 min total (vs. 4 min at medium, 16.7 min at original). `max_tokens: 48000` unchanged (it's a clamp). _(A first attempt also set `thinking: { type: "enabled", budget_tokens: 10000 }` — Opus 4.7 rejects this with 400; commit `05fccfd` reverted that part. Adaptive thinking depth is now shaped only by effort.)_
- **Audio-track-index fix.** `<audio>` elements in `buildFilmSkeleton` were missing `data-track-index`, defaulting to track 0 and colliding with scene `<section>`s (also track 0) and the full-film bg-music. Caused 4–5 `overlapping_clips_same_track` lint errors every render and broken voiceover playback. Now each audio clip claims its own track starting at 1 (commit `813ba9b`).
- **Scene-fill: explicit length budget.** New `LENGTH BUDGET — TIGHTNESS IS THE BAR` block added at the end of `buildSceneFillUserPrompt`: contentHtml ≤ 120 lines, sceneCss ≤ 80, timeline ≤ 150 GSAP calls. Counterweight to CREATIVE TARGET / ANTI-TEMPLATE / MOTION IS THE FILM mandates which were pushing 15–23K-token outputs.

**Expected after:** total wall time ~180–270s (3–4.5 min). Verification is end-to-end via dev server + UI submission (no unit tests for prompt outputs). See plan file for verification checklist + revert escape hatches.

**Out of scope (deferred):**
- 4 `overlapping_clips_same_track` audio-track lint errors at end of `film_html` (correctness bug, separate plan).
- Sonnet swap for storyboard/asset_plan/blueprint (lever still available if 3–4 min isn't enough).
- storyboard/asset_plan/blueprint stage tuning (their combined ~125s is acceptable).

---

## Current Sprint — Opus Creative Diversity (Sprint 4)

**Goal:** Two different scripts must produce visibly different films. Diagnosis: silent fallbacks (`DEFAULT_VISUAL_IDENTITY`, `sanitizeFilmRhythm` linear ramp) were stamping the same "Editorial Night" identity + linear energy curve onto every partial parse, and Opus 4.7's lack of `temperature` meant identical prompts → identical outputs. The storyboard prompt's own opening line ("Two scripts about two different products MUST produce visibly different films — if your output looks like the previous job, you have failed") was being structurally undermined by the code below it.

**What shipped (2026-05-18):**

- **Silent DEFAULT cascade killed.** `normalizeVisualIdentity` (`app/lib/hyperframes/llm-director.ts`) now throws `IdentityIncompleteError` when `paletteName`, `background`, `accents`, `headlineFont`, `motionLanguage`, `signatureMove`, or `assetPolicy` is missing — no more `||` fallback to Editorial Night. `generateStoryboard` catches and fires ONE retry with an addendum naming the omitted fields; second failure throws upward (job fails loudly instead of shipping a generic film). Safety-only fallbacks (`ink`, `inkMuted`, `bodyFont`, `monoFont`, `imageKeyword`) still cascade.
- **sanitizeFilmRhythm rewritten** to derive its fallback `energyCurve`, `cadenceMode`, and `climaxIndex` from the storyboard's `pacingIntent` sequence (`punch→0.85`, `cinematic→0.65`, `beat→0.5`, late `hold→0.95`, early `hold→0.25`). Cadence is picked from curve shape (local-maxima count, variance, peak position) instead of a fixed `slow_build_then_release`. Old linear ramp `0.3 + (i/N)*0.5` retained only as a last-resort fallback when no pacingIntents are passed. `generateFilmBlueprint` plumbs `storyboard.scenes.map(s => s.pacingIntent)` in.
- **Storyboard prompt rewritten** for script-specific invention. New `BANNED DEFAULTS` block explicitly forbids Editorial Night / Inter-only / "thin vertical accent bar" / "slow cinematic zoom" / corner-timestamp signatureMoves. DOMAIN→PALETTE table reframed from a lookup into "starting points" with a mandatory ±20–40° color-wheel shift based on emotional register + mandatory gradient customization. `sceneConcept`, `motionHook`, `motionLanguage` menus reframed as inspiration palettes — Opus may invent new names (`"liquid metal logo unfurl"`, `"twitchy + tender"`, `"shutter snap"`, etc.) and `FILM_SYSTEM_PROMPT` instructs the scene-fill stage to interpret invented names literally instead of collapsing them back to standard recipes.
- **Aesthetic Seed lexicon + per-script injection.** New `AESTHETIC_SEED_LEXICON` (60 adjectives spanning texture/material/light/density). `pickAestheticSeed(script)` uses FNV-1a 32-bit hashing to deterministically pick 3 adjectives per script. Injected into the storyboard user prompt as a mood-push block. This is the ONLY available mechanism for breaking Opus 4.7's determinism (no temperature/top_p/top_k support) — same script → same seed (so retries are stable); different scripts → different seeds (so the same prompt produces different mood pushes).
- **Vision critique counterweight.** Added `creativeDistinctiveness` to `SCENE_CRITIQUE_DIMENSIONS` (0..100; high = unmistakably script-specific, low = stock template). Added `filmRecognizability` to `FILM_CRITIQUE_DIMENSIONS` (same scale, film-wide). New verdict rules: scene-level `restraintQuality > 70 AND creativeDistinctiveness < 50` forces `refine` with major issue `restraint_without_distinctiveness`; film-level `filmRecognizability < 50` forces at least `refine_selected_scenes` with major issue `visual_genericness`. `buildRefinementSet` needs no changes — already routes by verdict + major-severity.
- **Cinematic principle #1 rewritten.** In `FILM_SYSTEM_PROMPT` AND `FILM_BLUEPRINT_SYSTEM_PROMPT`: "NO DEAD FRAMES, BUT RESTRAINT IS CRAFT" → "RESTRAINT IS A TOOL, NOT THE GOAL." Explicitly tells Opus that boldness, density, weirdness, dense layered motion, oversaturated color can all serve a script — don't default to cinematic restraint as a safe universal aesthetic. Dead-frame rule preserved as a clause inside the new principle.
- **CREATIVE MANDATE block injected** at the top of `STORYBOARD_SYSTEM_PROMPT`, `FILM_BLUEPRINT_SYSTEM_PROMPT`, and `FILM_SYSTEM_PROMPT` — the first thing Opus reads in each call. Frames every subsequent menu/recipe/principle as a "reference palette, not a pick-list" and explicitly directs invention over assembly. See memory [[feedback_invent_dont_assemble]].

**Architecture frozen — taste sprint only.** No new files, no new DB columns, no new pipeline stages. All changes inside `app/lib/hyperframes/llm-director.ts`.

**Out of scope (followups if regression check still shows convergence):**
- Asset-plan prompt rebalancing to reject "default" choices (currently relies on storyboard variance flowing through).
- `FILM_BLUEPRINT_SYSTEM_PROMPT` `motionLanguage.pacing` enum (still 3 options: calm/propulsive/staccato) — left alone since it's a blueprint-internal field, not user-facing.
- Per-scene `creativeDistinctiveness` tracking through the refinement loop telemetry.

---

## Previous Sprint — Comments → Audio Re-Direction (Sprint 3)

**Goal:** Per-scene comments now influence audio in addition to visuals. Comments like *"lower the music here"*, *"change this whoosh to a deeper boom"*, or *"voiceover sounds too aggressive"* re-direct music volume, SFX choice, and voiceover text/delivery during the Improve flow.

**What shipped (2026-05-18):**

- `generateAudioDirection(storyboard, blueprint, feedback?)` accepts an optional `feedback` param with `{previousPlan, previousResolved, commentsByScene}`. The system prompt gets a refinement-mode addendum (audio-keyword guide + restraint rules: leave scenes unchanged when comments don't mention audio). Base prompt stays cache-stable.
- `AudioPlan` gains `bgMusicVolumeOverrides: { sceneId, volume }[]` (0..1, clamped post-parse). Schema requires the field but defaults to empty.
- `buildFilmSkeleton(audio?)` injects GSAP volume keyframes (`tl.to("#bg-music", { volume: X, duration: 0.3, ease: "sine.inOut" }, sceneStart)`) per override + restore-to-default at sceneEnd-0.3. HF runtime support for audio property tweens is uncertain — preview is authoritative.
- `resolveAudioPlan(args)` accepts `previousPlan` + `previousResolved` and skips API calls per-entry when unchanged. ElevenLabs reuse is keyed on `(sceneId, text, deliveryHint)`. Freesound reuse is keyed on `(sceneId, kind, freesoundQuery)`. Jamendo reuse is keyed on `bgMusic.jamendoQuery`.
- `improveScenesFromComments` (`app/lib/jobs.ts`) now re-fires `generateAudioDirection` with the same comments AFTER the visual refinement, then calls `resolveAudioPlan` with the previous plan/resolved for smart-diff, persists via `persistResolvedAudio`, and uses the fresh bundle (`buildSkeletonAudioFromResolved`) for the rebuilt HTML. Guarded by `AUTO_AUDIO_ENABLED` + non-null `audio_direction` + `audio_auto_enabled`. Audio failure logs and falls back to the previous audio without blocking the visual improve.
- `buildSkeletonAudioFromPersisted` reads `bgMusicVolumeOverrides` from `audio_direction.plan` for HTML rebuilds.
- `usePlayback({ shots, job })` now reads per-scene bg volume overrides from `job.audio_direction.plan.bgMusicVolumeOverrides` and applies them to the music `<audio>` element when the active scene matches. Default mix mirrors the skeleton: 0.22 with VOs, 0.4 without.
- No new DB columns — everything lives inside the existing `jobs.audio_direction` JSONB.

**Out of scope (followups):**
- Audio re-direction triggered by vision critique (only comments today).
- Per-scene VO/SFX volume overrides (only bg music).
- Music gen instead of search (still Jamendo).

---

## Previous Sprint — Auto-Audio Direction (Sprint 2)

**Goal:** Add a third pipeline stage — the LLM picks music, SFX, and voiceover automatically — so the film comes back fully scored without the user touching the existing pickers. Existing manual MusicPicker / SfxPicker flow is unchanged; auto picks just pre-fill the same columns. Behind a feature flag.

**Authorization:** taste-sprint freeze override — user explicitly approved building this as a new pipeline stage (memory `feedback_taste_sprints`).

**What shipped (2026-05-17):**

- `generateAudioDirection(storyboard, blueprint)` (Opus 4.7, effort=medium, 8K tokens) in `app/lib/hyperframes/llm-director.ts` — emits `AudioPlan` { bgMusic | null, voiceovers[], sfxCues[] } scored to filmRhythm. System prompt enforces restraint (silence is a sonic choice; ≤3 SFX cues unless staccato_pulse; VO complements copy, never echoes it).
- `app/lib/elevenlabs-tts.ts` — `generateVoiceover()` calls ElevenLabs TTS (default `eleven_turbo_v2_5`). Env: `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`.
- `app/lib/audio-resolver.ts` — `resolveAudioPlan()` resolves the plan in parallel: Jamendo for bg music (picks tracks with ≥80% film duration), ElevenLabs TTS per scene (per-delivery voice_settings tuning, mirrored to Supabase Storage), Freesound for SFX (per-kind duration band filter). Per-item failures degrade gracefully.
- `buildFilmSkeleton(..., audio?)` extended to inject `<audio id="bg-music">` (looped, ducks via lower mix when voiceovers present), `<audio id="vo-sN">` per voiceover, `<audio id="sfx-sN-M">` per cue — all using the runtime's `data-start` / `data-volume` contract (no `class="clip"`).
- `runHyperframesDirect` wired: `directing → asset_planning → audio_direction (NEW) → generating_scenes → ...`. Feature flag `MOTIONGLASS_AUTO_AUDIO=true` + per-job `jobs.audio_auto_enabled` (default true). Audio stage failure logs + ships film without audio.
- `persistResolvedAudio()` writes bg music to existing `jobs.music_*` columns (the MusicPicker auto-surfaces them) and per-shot voiceover/SFX to new `shots.voiceover_url`, `shots.voiceover_text`, `shots.sfx_cues` JSONB. Pipeline writes don't require userId (direct write, bypassing the user-facing `updateJobMusic` helper).
- Critique + improve rebuild paths use a new `buildSkeletonAudioFromPersisted(job, shots)` helper so refined HTML keeps its audio without re-resolving.
- New `JobStatus = "audio_direction"`.
- New `jobs.audio_direction` JSONB (shape: `{ plan, resolved }`) and `jobs.audio_auto_enabled` BOOL. New `shots.voiceover_url`, `shots.voiceover_text`, `shots.sfx_cues` JSONB. Migration `20260530_audio_direction.sql`.
- `MusicSection.tsx` shows a `✨` prefix on its badge when `music_track_id` still matches `audio_direction.resolved.bgMusic.trackId` — gives the user a quick "this is the auto pick" signal without changing the picker UI.

**Out of scope (followups):**
- "Reset to auto" button in MusicPicker / SfxPicker (cached plan re-resolution).
- Multi-cue-per-scene SFX (plan caps at 1).
- Voice casting / multi-voice (single env-configured voice).
- Audio re-direction inside the critique loop (vision critique doesn't see audio yet).
- Per-scene auto SFX badge in `SfxSection` (the existing single-SFX picker is a different model).

---

## Previous Sprint — Film Quality v2 (AI Creative Studio)

**Goal (shipped 2026-05-16):** Move from "HTML motion generator" to "AI creative studio directing cinematic launch films." Real visual assets + vision-driven self-critique + film-level pacing intelligence. All Claude. Seven non-negotiable cinematic principles (see [`memory/feedback_cinematic_principles.md`](.claude/projects/C--Users-User-Desktop-motionglass/memory/feedback_cinematic_principles.md)).

Three sub-PRs, shipped independently.

### Sub-PR A — Asset intelligence (SHIPPED 2026-05-16)

- `generateAssetPlan` (Opus 4.7, effort=medium) — proactive per-scene asset planning. Slots: hero_product, ui_mockup, screenshot, background_texture, environmental, logo, icon, stock_photo, accent_shape. Sources: user_asset / flux / unsplash / synthetic_css.
- `app/lib/assets.ts` `sourceAssets` — pure orchestration, fully parallel. Resolves AssetPlan → SourcedAssetCatalog with concrete URLs (Flux mirrored to Supabase Storage via new `mirrorAssetForJob` helper) or pass-through `cssDirective` for synthetic slots. Per-slot failures degrade gracefully.
- `SceneBrief.lockedAssets` — pinned post-blueprint-parse so per-scene calls embed real imagery.
- `buildSceneFillUserPrompt` LOCKED ASSETS block — model embeds URLs verbatim.
- `generateFilmBlueprint(storyboard, identity, assetCatalog?)` — designs briefs AROUND locked assets.
- Storyboard duration relaxed [3, 10] → [1.5, 12]s (principle #2).
- Seven cinematic principles added to `FILM_SYSTEM_PROMPT` + `FILM_BLUEPRINT_SYSTEM_PROMPT`.
- New `JobStatus = "asset_planning"`.
- `runHyperframesDirect` wired: storyboard → asset_planning (plan + source) → generating_scenes → composition.

### Sub-PR B — Motion-trail composites + film rhythm (SHIPPED 2026-05-16)

- `StoryboardScene.pacingIntent`: punch | beat | cinematic | hold. Plus a heuristic default by duration band when the model omits it.
- `FilmBlueprint.filmRhythm` = { energyCurve[], restMoments[], impactMoments[], releaseMoments[], climaxIndex, cadenceMode, restraintNotes[] }. Model plans the energy wave BEFORE writing scene briefs. `sanitizeFilmRhythm` clamps + interpolates if the model misbehaves.
- `buildSceneFillUserPrompt` FILM RHYTHM POSITION block — labels each scene REST / IMPACT / RELEASE / CLIMAX, shows energy trend, gives pacing-intent-specific guidance.
- `captureMotionTrailComposite(html, durationSeconds, seekOffsetsSeconds[])` in `app/lib/hyperframes/thumbnail.ts` — 4 frames at 5/35/65/95% of scene local timeline, blended via `sharp` with ascending alpha (latest most opaque).
- Migration `20260522_motion_trail.sql` adds `shots.motion_trail_path`. `ShotRow` updated.
- `runHyperframesDirect` captures the composite alongside the existing thumbnail in the same per-scene loop. Errors degrade gracefully.

### Sub-PR C — Vision critique + refinement (SHIPPED 2026-05-16)

- Sonnet 4.6 (`SONNET_MODEL = "claude-sonnet-4-6"`) for both critique stages — fast judgmental work, Opus 4.7 stays for the creative passes.
- Per-scene `generateVisionCritique` — accepts the motion-trail composite URL; emits `SceneCritique` (8 score dimensions, verdict, structured issues with severity/dimension/description/suggestedFix). Dead-frame-vs-restraint is the load-bearing rubric distinction; `restraintQuality` is the dimension that distinguishes the two.
- Film-level `generateFilmCritique` — single call, sees ALL motion-trail composites at once + the planned `filmRhythm` + per-scene critiques as text. Emits `FilmCritique` (12 dimensions inc. inverted-style ones, verdict in {ship, refine_selected_scenes, redesign_rhythm}, filmLevelIssues with affectedSceneIds).
- `generateSceneFill` feedback param generalized from `lintFeedback: string | null` → `feedback: { kind: "lint" | "vision"; text: string } | null`. Same prompt cache (system prompt byte-identical); only the user-message label changes.
- `generateFilmHTML` return type expanded to `{ html, fills, blueprint, sceneContexts }` so jobs.ts can re-fire scenes with the same continuity snapshots. Backwards-compat: existing callers that destructure only `{ html }` still work.
- `refineScenes(blueprint, contexts, fills, refinements)` — re-fires flagged scenes in parallel with `kind: "vision"` feedback, returns patched fills. One round only — no recursion.
- `buildRefinementSet(perSceneCritiques, filmCritique)` — unions per-scene refine/reject verdicts + major issues + film-level affectedSceneIds. Per-scene and film-level feedback for the same scene gets a single concatenated block.
- New `JobStatus` values: `"vision_critique"` + `"refining_scenes"`.
- Migration `20260524_critique.sql` adds `shots.scene_critique` JSONB + `jobs.film_critique` JSONB. ShotRow/JobRow updated.
- `runHyperframesDirect` wired: capture → vision_critique (per-scene parallel + film-level single) → if refinements → refining_scenes → rebuild html → re-capture composites for refined scenes only → scenes_ready. New `captureScenes` helper consolidates the capture loop and is called both for initial captures (all scenes) and post-refinement (refined scenes only).

## Previous Sprint — Film HTML Perf

**Goal:** Reduce wall time + worst-case variance of `generateFilmHTML` (the second LLM call in the job pipeline), without isolating per-scene generation or losing continuity.

**Approved approach** (`.claude/plans/can-you-check-ancient-dove.md` for full detail):

### Layer 1 — Tune the single call (SHIPPED → superseded by Layer 2)
- `output_config.effort`: `"high"` → `"medium"` (kept on the per-scene calls).
- Storyboard call untouched.
- Layer 2 below replaces the monolithic call entirely, so the Layer 1 knob now applies to the per-scene calls.

### Layer 2 — Film Blueprint + batched scene calls (SHIPPED)
- **Stage A**: `generateFilmBlueprint` — one small Opus 4.7 call producing locked globals (`cssVariables`, `visualIdentity`, `motionLanguage`) + ordered `sceneOutline` with per-scene intent (incl. `transitionInIntent` / `transitionOutIntent`, `focalElementHint`, `startStateHint`, `endStateHint`).
- **Stage B**: per-scene fills. **Scene 1 runs solo**; scenes 2..N run in **groups of 2** (parallel within group, sequential between).
- Each scene call receives only **prev/current/next briefs** (not the full outline) + locked globals + previous-scene **structured** continuity (typed enums: `EndStateType`, `FocalRole`, `ScreenRegion`, `MotionDirection`, `TransitionType`, `Motif`) + motif registry + banned repeats.
- Each scene emits a `continuitySummary` with the same typed enums; freeform `notes` field is optional, ≤120 chars, never consumed by registry logic.
- After each group, `continuityState` + motif registry update from actual output, then feed the next group.
- Lint retry fires only failing scenes (not the whole film). One retry round.

### Layer 3 — Optional, later
- Cross-job cache pinger to keep `FILM_SYSTEM_PROMPT` warm.
- Move `runJob` to a worker thread / separate process.

**Calibration ground truth:** v11 reference scene (`memory/project_v11_reference.md`).
**Visual review method:** motion-trail composites, never still-frame contact sheets (`memory/feedback_motion_review_method.md`).

---

## Backlog

- Layer 3 items above.
- `lintCompositionHTML` errors don't carry a structured `sceneId` field — `bucketLintErrorsBySceneId` pattern-matches `s\d+` out of message/fixHint text. Works for the common case but may miss errors that reference scenes by other means. If retry routing turns out to be lossy in practice, extend the lint emitter upstream (in the `hyperframes` package) to surface sceneId explicitly.

---

## Completed

- **2026-05-16** — Film HTML perf sprint (Layer 1 + Layer 2):
  - Layer 1: `effort: "high"` → `"medium"` on the Film call.
  - Layer 2: replaced the monolithic 48K-token `generateFilmHTML` call with:
    - `generateFilmBlueprint` (one fast Opus 4.7 call, locks `cssVariables` / `motionLanguage` / `sceneOutline` with per-scene briefs + transition intents + transition-in choice with 2-3 non-hard_cut budget enforced post-parse).
    - `generateScenesWithContinuity` (orchestrator: scene 1 solo, then groups of 2 parallel; continuity state snapshotted per scene-call so lint retries reuse the same context).
    - `generateSceneFill` (per-scene call with verbatim `FILM_SYSTEM_PROMPT` for cache reuse, `SCENE_FILL_SCHEMA` with strongly-typed `continuitySummary` enums).
    - `bucketLintErrorsBySceneId` (regex `s\d+` to route lint errors to scenes, per-scene retry instead of full-film retry).
  - Public signature of `generateFilmHTML` and `FilmFills` return shape preserved — `app/lib/jobs.ts` unchanged.
  - Removed dead code: `FILM_FILLS_SCHEMA`, `renderFilmIdentityPrompt`.
