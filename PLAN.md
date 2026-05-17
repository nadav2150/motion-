# MotionGlass Plan

Living roadmap of in-flight work. Update after every planning decision or sprint completion.

---

## Current Sprint — Film Quality v2 (AI Creative Studio)

**Goal:** Move from "HTML motion generator" to "AI creative studio directing cinematic launch films." Real visual assets + vision-driven self-critique + film-level pacing intelligence. All Claude. Seven non-negotiable cinematic principles (see [`memory/feedback_cinematic_principles.md`](.claude/projects/C--Users-User-Desktop-motionglass/memory/feedback_cinematic_principles.md)).

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
