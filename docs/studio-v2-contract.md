# Videly v2 ("Studio") contract

Plan: `C:\Users\User\.claude\plans\now-videly-cahnge-full-transient-dongarra.md`. Types: `app/lib/studio/types.ts`. Migration: `supabase/migrations/20260930_studio_v2.sql`.

## Workstreams and file ownership

| Workstream | Owns | Must not edit |
|---|---|---|
| **A. Renderer** | `app/lib/studio/{browser,clock-shim,render,libs,contact-sheet}.ts`, `public/studio-libs/**`, `app/lib/studio/__fixtures__/**`, renderer tests, `Dockerfile` (fonts/flags only) | routes, UI, `generate.ts` |
| **B. Pipeline + API** | `app/lib/studio/{generate,prompts,anthropic,validate,audio,edit,format,templates,estimate,db}.ts`, `app/lib/reference-video.ts`, `app/lib/billing/**`, `app/lib/elevenlabs-tts.ts`, `app/routes/api.*` (new + auth fixes), `app/routes.ts` (API entries only), `src/worker.ts` | UI screens, renderer internals |
| **C. UI** | `app/app.css` tokens, `app/motionflow/ui/**`, `app/motionflow/screens/**` (new + restyled), page routes `app/routes/{home,videos,videos.$id,templates,brand,assets,team,settings,landing}.tsx`, `app/routes.ts` (page entries only), `package.json` (`lucide-react`) | `app/lib/**` except reading types |

`types.ts` is frozen; if a workstream needs a change, add optional fields only and note it in its final report.

## API (all JSON, all require the session cookie unless noted; 401 if signed out, 404 if the job belongs to someone else)

| Method + path | Body / query | Response |
|---|---|---|
| `POST /api/studio/jobs` | `CreateStudioJobInput` | `201 { id }` · `402 { error, needed, balance }` · `400 { error }` |
| `GET /api/jobs/:id` | — | `StudioJobView` when `generation_mode = 'v2'` (existing shape otherwise) |
| `GET /api/studio/videos` | `?filter=all\|drafts\|generating\|ready\|exports\|favorites&q=&limit=&cursor=` | `{ items: StudioVideoCard[], nextCursor }` |
| `PATCH /api/studio/videos/:id` | `{ title?, favorite? }` | `{ ok: true }` |
| `DELETE /api/studio/videos/:id` | — | `{ ok: true }` (soft delete: `deleted_at`) |
| `POST /api/studio/videos/:id/duplicate` | — | `{ id }` |
| `POST /api/jobs/:id/edit` | `{ instruction, revision? }` | `202 { revision }` · `409` if busy · `402` |
| `POST /api/jobs/:id/regenerate` | `{}` | `202 { revision }` (fresh generation from the same inputs, new revision) |
| `POST /api/jobs/:id/revert` | `{ revision }` | `{ currentRevision }` |
| `GET /api/jobs/:id/document?rev=n` | — | `text/html`: the revision's HTML with `buildClockShim({mode:"preview"})` injected first in `<head>`, CSP `default-src 'none'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' <storage> data: blob:; media-src 'self' <storage> blob:; connect-src 'none'`, `X-Frame-Options: SAMEORIGIN` |
| `GET /api/jobs/:id/timeline?rev=n&count=12` | — | `{ frames: { time, url }[] }` (cached JPEGs in storage) |
| `POST /api/jobs/:id/render` | `ExportOptions` | `202 { revision, renderStatus }` |
| `GET /api/jobs/:id/download?rev=n` | — | `302` to the MP4 with `Content-Disposition` filename |
| `GET /api/brand-kit` · `PUT /api/brand-kit` | `BrandKit` | `BrandKit` |
| `GET /api/assets?kind=` · `POST /api/assets` (multipart `file`) · `DELETE /api/assets/:id` | — | `{ items: UserAsset[] }` · `UserAsset` · `{ ok }` |
| `GET /api/studio/templates` (no auth) | `?category=` | `{ items: StudioTemplate[] }` |
| `GET /api/me/usage` | — | `{ planTier, planName, creditsBalance, creditsMonthly }` for the sidebar widget |
| existing `POST /api/reference-video` | multipart `file` | `{ referenceVideoUrl, storagePath, name }` |
| existing `POST /api/brand/scrape` | `{ url }` | brand colors/logo/text for the Website chip |
| existing `GET /api/voices` or `VOICE_CATALOG` | — | voice list for the AI Voice picker |

Polling: the UI polls `GET /api/jobs/:id` every 2 s while `stage` is not `preview_ready | done | failed`, and while any revision has `renderStatus` `queued | rendering`.

## Generated document contract (enforced by `validate.ts`)
- One complete HTML document; `<body>` exactly `width x height`, `overflow:hidden`, `margin:0`.
- In `<head>`, synchronously: `window.__videly = { duration, fps, width, height }`. Optional: `__videly.ready` (Promise), `__videly.onSeek(fn)`, `__videly.timeline` (a paused GSAP timeline).
- Libraries only from `/studio-libs/<name>/...` (see `libs.ts`); fonts from Google Fonts CSS or `/studio-libs/fonts/`. Assets only from the URLs the pipeline passes in.
- Pure function of time: everything is drawn from the absolute time (GSAP timelines, CSS/WAAPI animations, or rAF loops reading `performance.now()`); no `dt` accumulation, no user input, no network (`fetch`/XHR/WebSocket blocked).
- Voiceover cue times given in the prompt are hit exactly; audio is never embedded in the document (the renderer muxes it).
