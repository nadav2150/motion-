# Videly AI container image for Cloudflare Containers.
#
# Base: Microsoft's official Playwright image (Ubuntu noble + Node 22 +
# Chromium + glibc). Sharp picks up its linux-x64 prebuilt binary against
# this image's glibc out of the box. Matches the `playwright` npm version
# in package.json — keep them in lockstep or browser launch will fail.

ARG PLAYWRIGHT_TAG=v1.60.0-noble

# ─── deps ──────────────────────────────────────────────────────────────
# Install all node modules (incl. dev deps) for the build stage.
FROM --platform=linux/amd64 mcr.microsoft.com/playwright:${PLAYWRIGHT_TAG} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ─── build ─────────────────────────────────────────────────────────────
# Run the React Router production build. Vite bakes any VITE_* env vars into
# the client bundle at this step. Polar checkout is created server-side, so no
# billing client tokens or product IDs are needed here — only PostHog config.
FROM --platform=linux/amd64 mcr.microsoft.com/playwright:${PLAYWRIGHT_TAG} AS build
WORKDIR /app

ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

ENV VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY} \
    VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── runtime ───────────────────────────────────────────────────────────
# Clean image with prod deps only + build artifacts. The Container DO
# probes localhost:${PORT} until the server is listening, so PORT must
# match the `defaultPort` on the MyContainer class in src/worker.ts.
FROM --platform=linux/amd64 mcr.microsoft.com/playwright:${PLAYWRIGHT_TAG} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# FFmpeg is required for video encoding: the hyperframes renderer
# (`npx hyperframes render`) and the stitch step (app/lib/hyperframes/stitch.ts,
# FFMPEG_BIN="ffmpeg") both shell out to it. The Playwright base image ships
# Chromium but no system ffmpeg, so renders fail with "FFmpeg not found".
# Installed as root here, before the image drops to the pwuser user below.
#
# Fonts for the Studio (v2) renderer, which screenshots generated documents in
# this image's Chromium. The Playwright base already ships Liberation, Noto
# Color Emoji, IPA Gothic / WenQuanYi (CJK fallbacks) and FreeFont. Added:
#   fonts-noto-core  Noto Sans/Serif for Hebrew, Arabic, Devanagari, Thai, Greek,
#                    Cyrillic... so non-Latin captions and on-screen text get a
#                    real typeface instead of FreeFont or tofu.
#   fonts-inter      system Inter, the fallback when a document names Inter but
#                    does not load /studio-libs/fonts/inter/inter.css.
# libass (for burning subtitles) comes with the ffmpeg package.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-inter \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Playwright image ships with a non-root `pwuser`; Chromium refuses to run as
# root anyway. Files are created owned by pwuser instead of a final
# `chown -R /app`, which rewrote every file (all of node_modules) into a new
# layer on each deploy, so even a one-line change re-pushed the whole tree.
# Now the dependency layer stays cached and a code change pushes only build/.
RUN chown pwuser:pwuser /app
USER pwuser

COPY --chown=pwuser:pwuser package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=pwuser:pwuser --from=build /app/build ./build

EXPOSE 8080

# Worker secrets reach the container only when an instance starts, and
# `wrangler deploy` replaces running instances only when the image changes.
# After changing secrets, bump this value and deploy to roll every instance.
LABEL io.videly.rollout="2026-09-30-dodo-test-mode"

# Two processes, one container: the React Router web server and the Studio
# task worker (studio_tasks queue; generate / edit / render run there, so web
# requests never share a process with headless-Chrome renders and a web
# restart never kills a video). build/worker/supervisor.mjs starts both,
# forwards SIGTERM (the worker gets up to 60 s to finish running tasks) and
# restarts a crashed child; see app/lib/studio/supervisor.ts for the policy.
# node directly (not npm) so signals reach the supervisor.
CMD ["node", "build/worker/supervisor.mjs"]
