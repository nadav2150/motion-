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
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build

EXPOSE 8080

# Playwright image ships with a non-root `pwuser`. Chown app dir so the
# user can read it; Chromium itself refuses to run as root anyway.
RUN chown -R pwuser:pwuser /app
USER pwuser

CMD ["npm", "run", "start"]
