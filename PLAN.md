# MotionGlass — production pipeline

Living plan. Updated after every planning decision or sprint completion.

> Origin plan: `~/.claude/plans/we-are-replacing-the-rippling-bunny.md`
> (frozen historical artifact — do not edit; edit this file instead).

---

## Current direction — Raw-LLM HyperFrames pipeline ⏵ live

After 27 Sprint 1 variants and a 6-scene raw-LLM probe, the user judged the raw LLM output substantially better than v11. The Motion Intelligence System philosophy work is paused; the raw-LLM pipeline is now the production path.

```
POST /api/jobs { script }
  → createJob → generation_mode='hyperframes'
  → runJob:
     status='directing'         → generateStoryboard(script)   // LLM → scenes[]
     status='generating_scenes' → generateSceneHTML(scene) per scene  // LLM → index.html
     status='rendering_scenes'  → renderScene per scene (parallel 2) // npx hyperframes
     status='stitching'         → stitchHyperframes  // ffmpeg concat
     status='completed'
```

End-to-end smoke verified: 2-scene script → storyboard → per-scene HTML → render → stitch → `final_video_url` populated (`scripts/smoke-hyperframes-pipeline.ts`).

| Surface | Path | Status |
|---|---|---|
| LLM director (two-stage) | `app/lib/hyperframes/llm-director.ts` | new |
| Pipeline branch | `app/lib/jobs.ts` (`runHyperframesJob`) | wired |
| HyperFrames render | `app/lib/hyperframes/render.ts` | bug fix: pass `"."` not `"index.html"` to hyperframes CLI |
| Stitch | `app/lib/hyperframes/stitch.ts` | reused as-is |
| API | `app/routes/api.jobs.tsx` | dropped imageModel/videoModel/filmMode params |
| Editor UI | `app/motionflow/screens/editor.tsx` | removed model selectors, FILM MODE toggle, marketing copy reference to Flux/Imagen/Nano Banana |
| Legacy AI-media path | `runLegacyAiMediaJob` in `app/lib/jobs.ts` | preserved for existing rows with `generation_mode='legacy_ai_media'` |

### Open items

- **Supabase schema is behind `schema.sql`.** The `reapOrphanedClips` reaper logs `column 'clip_started_at' not found` on every `getJob`. Doesn't block hyperframes flow (no clips involved). Fix: re-run `supabase/schema.sql` against the current Supabase project.
- Legacy code (director.ts / prompt-engine.ts / replicate.ts / vision-validator.ts / MotionGlass philosophy files) stays dormant on disk; safe to delete in a separate cleanup PR when the user is confident the pivot sticks.

---

## Archived — Motion Intelligence System work (paused)

The prior planning lives below for history. Sprint 0 produced the foundation; Sprint 1 produced v11 (locked reference scene under `~/.claude/projects/.../memory/project_v11_reference.md`). The MotionGlass philosophy files (`philosophy.ts`, `primitives/`, `composer/`, `frame-taste.ts`, `budgets.ts`) remain in the tree as exploration history.

## Mission (archived)

Replace the current `Script → director → Replicate → optional Kling → Supabase → vision validation` pipeline with a **Motion Intelligence System** whose moat is **taste** — a stated motion philosophy that compiles into operational rendering laws, a frame-level taste sensibility, and a structured human review protocol.

**MVP target:** one iconic 30-second motion piece with a MotionGlass-native identity. Not a Stripe imitation. Not a Linear imitation. *MotionGlass.*

**After this version, the architecture is frozen.** Next phase: render → compare → obsess → trim → retime → remove → tighten → repeat. Engineering recedes; directing takes over.

---

## Status

### Sprint 0 — Foundation (build-only) ✅ COMPLETE

All scaffolding for downstream sprints. Smoke-verified.

| Artifact | Path |
|---|---|
| Migration | `supabase/migrations/20260514_hyperframes.sql` |
| Types | `app/lib/hyperframes/types.ts` |
| `JobRow`/`ShotRow`/`JobStatus` extensions | `app/lib/supabase.ts` |
| Philosophy + rendering laws (v0) | `app/lib/hyperframes/philosophy.ts` |
| Primitives registry (lint enforced) | `app/lib/hyperframes/primitives/registry.ts` |
| Atomic primitives (×3) | `app/lib/hyperframes/primitives/{focal-collapse,stagger-word-reveal,depth-shift}.ts` |
| Easing curves (×3) + canonical kinetic fits | `app/lib/hyperframes/primitives/easing.ts` |
| Budgets (attention/motion/complexity) | `app/lib/hyperframes/budgets.ts` |
| Spatial Intelligence Layer (3 archetypes) | `app/lib/hyperframes/composer/spatial.ts` |
| Silence-first composer (skeleton) | `app/lib/hyperframes/composer/silence-first.ts` |
| Assembler + Tell 1 / Tell 2 wiring | `app/lib/hyperframes/composer/assemble.ts` |
| Deterministic emitter (hard laws + Tells) | `app/lib/hyperframes/composer/emit.ts` |
| Exit-state derivation | `app/lib/hyperframes/composer/exit-state.ts` |
| Frame Taste Layer (hard + soft) | `app/lib/hyperframes/frame-taste.ts` |
| HyperFrames renderer (`npx hyperframes render`) | `app/lib/hyperframes/render.ts` |
| FFmpeg stitcher (concat + re-encode fallback) | `app/lib/hyperframes/stitch.ts` |
| Storage helpers (upload Buffer / scene / final) | `app/lib/storage.ts` |
| Smoke verification script | `scripts/sprint-0-smoke.ts` |

**Smoke results (`npx tsx scripts/sprint-0-smoke.ts`):**
- Topology: `asymmetricLeft`, focal=(0.28, 0.42), negative-space coverage 86.6%.
- Budgets: attention=1.93, motion=1.33, complexity=1.45.
- Assembled: Tell 1 fired (pre-reveal compression around `staggerWordReveal`); Tell 2 added 119 ms late-release.
- Frame-taste: `hardLawsPassed=true`, peak density 1, mean 0.77.
- Soft warnings flagged easing/kinetic mismatch (tuning data, not a failure).
- Output written to `out/sprint-0/scene_01/` — open `index.html`, confirm `window.__timelines["scene_01"]` registers and plays.

### Sprint 1 — "Does the MotionGlass philosophy *render*?" 🎬 IN PROGRESS — **TASTE SPRINT**

**Architecture is frozen.** Sprint 1 is not engineering. It is directing.

Job shift: from *"make the system smarter"* → *"make the motion feel inevitable."*

#### Do NOT add (locked)

- New systems
- New primitives
- New rhythm modes
- New archetypes
- New kinetic states
- New abstractions

A failed sprint = **tune**, never **expand**.

#### Standing Sprint 1 guidance

1. **Render quality > system elegance.** A messy render with conviction beats a perfectly lawful render with no presence.
2. **Soft warnings are signals, not failures.** Especially easing/kinetic mismatches. Do not optimize the system into mathematical correctness.
3. **Tells stay subconscious.** If reviewers can explicitly identify Tell 1 / Tell 2 as a gimmick, *reduce* visibility — never elaborate them.
4. **Optimize for ONE unforgettable render**, not consistency across 20. The target is the *"what the hell is this?"* reaction.
5. **Do not normalize strangeness away.** Tense, unresolved, slightly uncomfortable, imperfect, overly held, asymmetrically weird = signal. Resist the urge to smooth.
6. **Install + validate the real HyperFrames render pipeline immediately**, before any large render loop. HTML motion feel ≠ video motion feel. Validate: pacing after encode, easing perception, compression artifacts, hold-frame feeling, stitched continuity.
7. **FrameTasteLayer is not beauty police.** Its job: detect collisions, dead motion, unreadability, pacing collapse. Not optimize all motion into safe correctness.
8. **Killer Reviewer > architecture.** "Feels generated" = failed render, regardless of technical correctness.

#### What gets built (minimal, only because Sprint 0 left it unbuilt)

The 3 files below are the only engineering work permitted in Sprint 1:

- `app/lib/hyperframes/kinetic-layer.ts` — maps kinetic state → bias vectors for selector / spatial / rhythm / typography / easing.
- `app/lib/hyperframes/cinematic-arbitrator.ts` — weighted priority resolution (philosophy + kinetic + budgets + readability).
- `app/lib/hyperframes/composer/select.ts` — deterministic selector. Silence-first. Philosophy laws as hard constraints. Creative Rebellion Budget (must fire once per film).

After these three exist, no more engineering until the gate is reached.

#### Sprint 1 order of work

1. **Install + validate HyperFrames CLI.** Render one Sprint 0 smoke scene end-to-end (HTML → MP4). Inspect the encoded result; confirm pacing / easing / hold-frame survives encode. **Do not proceed until this is true.**
2. Build the 3 files above (minimally — taste is the work, not these).
3. Hand-author DNA / kinetic / intent for **one** scene.
4. Render. Inspect. Tune (philosophy numbers, primitive physics, easing pick, archetype choice). Re-render. Iterate.
5. Hunt for the **unforgettable render** — the one that causes *"what the hell is this?"*
6. Only after that exists, produce the surrounding 19 to feed the Protocol.

#### Gate

Taste Reviewer (≥ 2 inevitable, ≤ 1 decorative/collapse across top 20) **AND** Killer Reviewer (≥ 12/20 survive). **And one of those renders must be unforgettable** — not safe average across 20.

If 0–4 inevitable: tune philosophy laws, primitive physics, justification threshold, easing/kinetic biases. **Do not add primitives or concepts.**

#### Sprint 1 — render exploration log

**18 renders generated** through `scripts/sprint-1-variations.ts`. Variations stay at the exploration-script layer (topology trims, CSS overrides) — no `app/lib/hyperframes/*` changes.

| Batch | Theme | Variants | Key finding |
|---|---|---|---|
| 1 | Motion restraint | v01–v06 | The satellites are decorative noise; v01 (least motion) is stronger than v03 (most motion). Subtraction works. |
| 2 | Subtraction past satellites | v07–v10 | v07 (text only) confirms satellites add nothing. v09–v10 (160 px headline) is where MotionGlass starts to *have a look*. Pure black + commanding type = conviction. |
| 3 | Retime the envelope | v11–v14 | v10's 5 s envelope held 2.7 s of identical frames at the end — too long. **v11 (3 s, late text, 160 px) is the strongest single render**: 33% silence / 33% reveal / 34% held. |
| 4 | Tell 2 hypothesis test | v15–v18 | Pushing reveal to scene-end (so Tell 2 is the only stillness) *weakens* the scene — too-short text dwell. **Reframing:** Tell 2 is meant to be subconscious — the cushion at the trailing edge of a deliberate hold, not a perceptible behavior on its own. customCubic1 (v18) shows visible bounce halo → gimmick territory (physics table already flagged its low affinity for `pressureBuild`). |

**Finalist family:** v11 (strongest), v17 (gentler easing alternative), v07 (disciplined entry).

**🔒 v11 — LOCKED reference scene** (user-confirmed). The Sprint 1 ground truth for *establish_problem* / *pressureBuild* with ~5-word copies. Exact configuration archived at `~/.claude/projects/.../memory/project_v11_reference.md`. Future calibration is measured against v11; v11's settings are NOT promoted into architectural defaults — different intents/kinetics may legitimately need other shapes.

**Contrast pair — v28 anti-v11**. After v11 locked, the next move is **contrast, not refinement.** Identity is built through opposition, not iteration. v28 (`out/sprint-1/v28_anti_v11/scene.mp4`) is one deliberate counterpart to v11: same architecture and primitives, every emotional dimension pushed the other way (release / openness / calm / early / soft). The question the pair tests: *can MotionGlass survive contradiction while still feeling authored by the same system?* That judgment lives in playback — trails and time-strips are diagnostic only from here forward.

**Review methodology established:** still-frame contact sheets hide motion; switched to motion-trail composites (blended frames) plus per-variant time-strips. Trails make decorative motion visible as noise, and time-strips expose temporal envelope problems.

**Resolved Sprint 1 directing questions:**

- *How much motion is enough?* — Less than v0 produces by default. Satellites are decorative; remove them.
- *How perceptible should Tell 2 be?* — Subconscious. It rides the trailing edge of a deliberate hold; do not try to surface it.
- *Does the philosophy render?* — Yes, *after* subtraction and after the temporal envelope is tightened. The default `app/lib/hyperframes/composer/spatial.ts` topology and 5 s scene durations were both too generous.

**Open Sprint 1 questions (pending direction):**

- Does the v11 envelope generalize across other headlines (longer text, shorter text)?
- Does the same envelope work for other intents (not `establish_problem`) or other kinetic states (not `pressureBuild`)?
- Should the project-level default topology drop satellites entirely (i.e., is the "no satellites" finding so robust that `spatial.ts` defaults should change)? — That *would* be an architecture change, deferred for user direction.
- Build a 3-scene sequence using v11-family scenes to test continuity / motif behavior across the actual film unit (this jumps to Sprint 2's territory; flag for direction).

#### Sprint 1 batches 5+6 — generalization test

**Batch 5 (5 variants, v19–v23): does the envelope survive copy mutation?** Headlines varied (short / aggressive / emotional / question / imperative); everything else held to v11. Result: **No.** The 160 px / 3 s envelope is calibrated for ~5-word copies. Short copies (v19 "Yours doesn't.") leave ~70% of the focal section empty. Long copies (v21 "Something is different about yours.") wrap to 5 lines and fill the column wall-to-wall, killing the breathing room. The reveal *duration* also scales with word count, so the post-reveal hold varies from ~1.6 s (v19) to ~0.65 s (v21) within the same 3 s envelope. The "33/33/34 rhythm" claim was specific to a 5-word headline.

**Batch 6 (4 variants, v24–v27): does the envelope survive kinetic mutation?** Cannot be answered from current build. v11 and v27 (negative control, same params, only kinetic field changed) are **byte-identical MP4s** (189,372 bytes each, verified). The `kinetic` field is pure metadata today — no selector reads it. v24 (releaseDecay) and v25 (unstableGravity) only differ from v11 because *I manually* picked different easings to match what `easing.ts` `kineticAffinity` says is the best fit. The system didn't make those choices. Trails of v11/v24/v25 are nearly identical because trails average out easing shape — the during-motion feel is exactly the dimension this review method can't measure.

**Batch 6 wildcard — v26 (breathingHold, zero primitives):** 32 KB MP4 (vs ~185 KB for animated variants), time-strip shows 8 pixel-identical frames. By trail-density (the only objective presence metric I've been using), v26 outscored every animated variant — text occupies 100% of every frame. **It is unresolved from inside this session whether v26 is "powerful stillness" or "boring slide."** Requires user-side playback judgment.

**Honest answer to "Did we find identity?":** No. We found a lucky scene calibrated to one specific 5-word copy at one specific intent. The envelope doesn't generalize to other word counts. The kinetic dimension produces zero behavior change in the current build. The static no-motion variant outscored every animated variant on the only objective metric available. What we *did* establish as priors: subtraction is the right direction, big type is the right scale, late entry is the right rhythm for ~5-word copies, Tell 2 wants to be subconscious. None of those is *identity* — identity would require the system to respond *correctly* to content it hasn't seen before.

**What I declined to do next:** spawn a Batch 7 to auto-calibrate the envelope from word-count. That would be the "more systems" trap.

**Open: v26 specifically.** It is the only render I cannot explain from trails + time-strips alone. Awaiting playback judgment on whether it reads as restraint or as nothing.

### Sprint 2 — "Can a motif evolve kinetically across 3 scenes?" — pending

Build `motif-memory.ts`, `film-memory.ts`, motif-aware `similarity.ts`. Hand-author 3 scenes with kinetic progression and one declared motif with planned recalls.

### Sprint 3 — "Can silence have impact?" — pending

Build `rhythm-engine.ts`. Confirm silence-first reaches zero-primitive output for `breathingHold` scenes.

### Sprint 4 — Wire the LLM director — pending

Build `director.ts`, wire `runJob`, build `taste-arbitrator.ts` (subtractive safety net).

### Sprint 5 — End-to-end + legacy regression — pending

`api.jobs.tsx` accepts `generationMode`; legacy mode regression; determinism fixture for `select`; vocabulary guard grep; 3 smoke scripts.

---

## Architecture (frozen after Sprint 0)

```
Script
 → Director (intent / tension / cadence / kinetic / DNA + film rhythm proposal + motifs — JSON only)
 → RhythmEngine (slot per scene; 3 cadence modes)
 → CinematicArbitrator (weighted priority resolution incl. philosophy laws + kinetic bias)
 → Composer (silence-first):
     SpatialIntelligenceLayer (3 archetypes; eye-flow / focal gravity / breathing room / density rhythm / reading flow)
     PrimitiveSelector (deterministic; budget-aware; philosophy laws as hard constraints; Creative Rebellion Budget)
     MotifMemory (intentional callbacks)
     FilmMemory (cumulative saturation)
 → Assemble → Emit (deterministic {html, css, js}, signature Tells injected)
 → FrameTasteLayer (sub-second; hard laws gate emission)
 → TasteArbitrator (composition-level subtractive safety net)
 → SimilarityEngine (motif-aware)
 → HyperFrames render → per-scene MP4
 → FFmpeg concat → final MP4
```

Remix / React Router 7 app stays. Only **generated scenes** are standalone HTML.

---

## MVP scope (frozen)

- **3 primitives**: `focalCollapse`, `staggerWordReveal`, `depthShift`.
- **3 layout archetypes**: `asymmetricLeft`, `centeredCompressed`, `layeredDepth`.
- **3 rhythm modes**: `slow_build_then_release`, `staccato_pulse`, `ebb_flow`.
- **3 easings**: `power3.inOut`, `expoOut`, `customCubic1`.
- **5 kinetic states**: `lockedMomentum`, `unstableGravity`, `releaseDecay`, `pressureBuild`, `breathingHold`.
- **1 each**: philosophy (v0 laws), motif system, taste arbitrator, cinematic arbitrator, rhythm engine, film memory, motif memory, spatial layer, frame taste layer.
- **3 scenes** end-to-end target.

Anything beyond this list is forbidden in MVP. New systems require a passed Taste Sprint gate.

---

## Strategic principles (immutable)

1. Motion is expensive. Silence is the default state; motion must be earned.
2. Motion is language. Opinion compiles into rendering laws, not just prompts.
3. Identity > imitation. References are contrast points.
4. Composition is macro; frames are micro. Both are evaluated.
5. Controlled repetition > random novelty (motifs).
6. LLM never writes code.
7. Silence-first composition.
8. Determinism kills GPT combination recycling.
9. **Creative Rebellion is required, not optional.** Every film must break one rule.
10. **Architecture is frozen at end of Sprint 0.** Sprints 1+ tune taste, not systems.
11. Taste is measured by Taste Reviewer + Killer Reviewer protocol.
12. **MotionGlass has signature tension** — recognizable blindfolded.

---

## Motion Philosophy v0 (laws live in `app/lib/hyperframes/philosophy.ts`)

| Tenet | Rendering law (concrete) |
|---|---|
| Weighted inevitability | Primary primitive accel delay < 80 ms; easing monotonic-converges in first 60%; velocity must not reverse unless `intent="contrast"`. |
| Earned silence | First 250 ms motion-free unless `slot.isImpact`; typography clear-window ≥ 600 ms; `kinetic="breathingHold"` ⇒ zero primitives. |
| Compressed depth | Max 4 simultaneous depth layers; ≥ 18% gap between adjacent; no layer collision in 200 ms window unless motif-bound. |
| Confident asymmetry | `asymmetricLeft` focal-x ∈ [0.18, 0.38]; dominant negative space ≥ 55% coverage; no centered focal unless `intent="establish_problem"` or `kinetic="lockedMomentum"`. |
| Typography as motion | On text enter, no competing primitive for 600 ms; `staggerWordReveal` stagger ∈ [60, 140] ms; text opacity reaches 1.0 before any secondary motion. |

---

## Signature Tension — MotionGlass tells (in every film)

- **Tell 1 — Pre-reveal compression.** Negative space over-compresses 8–15% for 180–260 ms before any reveal primitive; snaps back at the reveal start. Injected by `composer/emit.ts`.
- **Tell 2 — Late-release motion.** Last primitive's effective duration extended 80–120 ms past the easing's settling point. Injected by `composer/emit.ts`.

## Intentional Imperfection Laws

- **Held-frame rule:** one scene per film holds its final frame 200–400 ms past resolution.
- **Density variance rule:** scene-to-scene mean frame-density variance ≥ 1.2σ.
- **Roughness pass:** if all scenes pass clean (zero warnings, zero subtractions, no rebellion fired), force a roughness pass. Cleanliness is a failure state.

## Creative Rebellion Budget

Every film **must** spend one rebellion. Builder fails and re-runs if zero rebellions fired. Allowed kinds: bypass-law / exceed-budget / force-saturated-primitive / long-hold / early-motion. Persisted on `shots.rule_break_used` + `shots.rule_break_kind`.

---

## Decisions locked in

- Legacy AI-media flow kept as opt-in (`generation_mode = "legacy_ai_media"`); default `"hyperframes"`.
- `npx hyperframes render` via Node `spawn` (no new npm dep).
- Scene files in `os.tmpdir()/motionglass/{jobId}/{sceneId}/`, then Supabase.
- New `stitch.ts` for hyperframes; legacy `stitcher.ts` untouched.
- Composer is deterministic; LLM only directs intent / tension / cadence / kinetic / DNA / rhythm / motif.
- Scene-builder = single GPT-4o call per scene → forbidden. LLM never writes code.
- Migration: `supabase/migrations/20260514_hyperframes.sql`.

## Anti-goals (hardened)

- Adding primitives, easings, archetypes, kinetic states, rhythm modes after Sprint 0.
- Configurable philosophy or branchable signature tensions.
- Quantitative taste metrics replacing human review.
- Stripe/Linear/Apple as imitation targets.
- Architecture iteration disguised as taste calibration.
- Semantic emotion labels (kinetic states only).
- Beautifully safe outputs.
- A render the Killer can convincingly call "generated."

## Taste Review Protocol

Per sprint: produce render archive + two reviews (`taste-review/sprint-{N}.md`).

- **Taste Reviewer** — 6 annotations per render: where motion is inevitable / attention collapses / motion is decorative / silence is powerful / spacing fails / typography breathes.
- **Killer Reviewer** — adversarial. Sticky-question kill list: feels generated? too designed? startup-y? trying too hard? decorative? lacks conviction? too elegant? emotionally flat? recognizably MotionGlass?

**Gate:** Taste (≥ 2 inevitable, ≤ 1 decorative/collapse) AND Killer (≥ 12/20 renders survive). Both required.

---

## Deferred (out of scope for MVP)

- More primitives / easings / archetypes / kinetic states / rhythm modes.
- LLM-driven layout composition.
- Upload UI / `/api/uploads`.
- HyperFrames CLI version pinning beyond `npx`.
- Editor UI changes (additive DB fields only).
- Per-scene retry endpoint.
- Audio / voiceover synthesis.
- A/B harness for weight tuning.
- Cross-film FilmMemory (brand identity across jobs).
- Motif emergence detection.
- Self-tuning philosophy.
- Automated taste metrics (always human, always Protocol).

## Open items / blockers

### HyperFrames render — validated ✅

- `hyperframes@0.6.6` (HeyGen) resolved via `npx`.
- `hyperframes doctor` green: Node, FFmpeg, FFprobe, Chrome headless cache (Docker optional, not running).
- Sprint 0 smoke scene rendered: **350 KB MP4, 1920×1080 H.264 yuv420p, 30 fps, 154 frames, 5.133 s** (vs 5.119 s assembled — single-frame rounding).
- Render time: 6.9 s wall-clock (5 parallel Chrome workers).
- ✅ Pacing survives encode. ✅ Easings perceptible. ✅ No compression artifacts. ✅ No timing collapse.
- Artifacts: `out/sprint-0/scene_01/scene.mp4` + `frames/frame-{01..07}.jpg` checkpoints.

### Sprint 1 first-tuning items (tuning, not architecture)

These came out of the validation render. They are taste-calibration work for Sprint 1 — physics numbers, magnitude tuning, emit cosmetics — **not** new systems.

**Subline removal pass (silence-first applied to the scene):**

- Removed the `subline` node from all three archetypes (`spatial.ts`); eye-flow arrays cleaned up to match. No architecture or law changes; the headline now occupies its full focal section. 302 KB MP4, identical duration & frame count.
- **Tell 1 perceptibility — RESOLVED** ✅. Without changing Tell 1's parameters, removing the competing typography let the satellites' inward drift register clearly between frames 1→2. Direct evidence that "earned silence" pays off: subtle motion reads when nothing else is fighting for the eye.
- **Composition feel — RESOLVED** ✅. The single bold headline on a breathing right-side negative space now reads as deliberate weight, not as a sparse template. Headline wrap to two lines feels like rhythm, not overflow.

**Still open:**

- **Tell 2 behavior** — still invisible. focalCollapse settles at ~4.3 s; the 700–800 ms of static tail already inside the scene absorbs Tell 2's 119 ms append. Tuning question for Sprint 1: should Tell 2 stretch the *last primitive's* settling tail (easing breathes longer) rather than append no-op time after settle? Flag for taste review — do not pre-judge.
- **`missing_timeline_registry` lint warning** — `window.__timelines` assignment lives inside an IIFE; HyperFrames' static scan wants top-level. Render succeeds anyway. One-line emit cosmetic fix when Sprint 1 starts.
- **Satellites still feel decorative** rather than load-bearing — they exist mainly as carriers for Tell 1's pre-reveal compression. Sprint 1 taste calibration: do they need a stronger compositional role, or is "quiet weight" their actual job?

### Later

- **Apply migration** — `supabase/migrations/20260514_hyperframes.sql` has not yet been applied to Supabase. Run it before testing the hyperframes branch of `runJob` (Sprint 4).
- **Bucket file-size limit** — `storyboards` bucket created with 25 MB limit. Final stitched 30 s film may exceed it. Bump in Supabase dashboard at Sprint 5.

## How to keep this file current

After any of the following, update `PLAN.md` in the same commit:

- A sprint completes → move it from "next" / "pending" to "complete" with an artifacts table.
- A new decision or scope change → update the relevant section.
- A piece of work is deferred → move it to "Deferred."
- A new open item / blocker appears → add to "Open items."
- A taste-review verdict comes in → record the gate verdict next to the sprint.
