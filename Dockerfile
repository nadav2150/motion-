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
# Run the React Router production build. Vite bakes any VITE_* env vars
# into the client bundle at this step, so the Paddle live client token +
# price IDs must be passed in as --build-arg or they'll be missing in prod.
FROM --platform=linux/amd64 mcr.microsoft.com/playwright:${PLAYWRIGHT_TAG} AS build
WORKDIR /app

ARG VITE_PADDLE_ENV=live
ARG VITE_PADDLE_LIVE_CLIENT_TOKEN
ARG VITE_PADDLE_LIVE_PRICE_STARTER
ARG VITE_PADDLE_LIVE_PRICE_PRO
ARG VITE_PADDLE_LIVE_PRICE_STUDIO
ARG VITE_PADDLE_LIVE_PRICE_PACK_SMALL
ARG VITE_PADDLE_LIVE_PRICE_PACK_MEDIUM
ARG VITE_PADDLE_LIVE_PRICE_PACK_LARGE
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

ENV VITE_PADDLE_ENV=${VITE_PADDLE_ENV} \
    VITE_PADDLE_LIVE_CLIENT_TOKEN=${VITE_PADDLE_LIVE_CLIENT_TOKEN} \
    VITE_PADDLE_LIVE_PRICE_STARTER=${VITE_PADDLE_LIVE_PRICE_STARTER} \
    VITE_PADDLE_LIVE_PRICE_PRO=${VITE_PADDLE_LIVE_PRICE_PRO} \
    VITE_PADDLE_LIVE_PRICE_STUDIO=${VITE_PADDLE_LIVE_PRICE_STUDIO} \
    VITE_PADDLE_LIVE_PRICE_PACK_SMALL=${VITE_PADDLE_LIVE_PRICE_PACK_SMALL} \
    VITE_PADDLE_LIVE_PRICE_PACK_MEDIUM=${VITE_PADDLE_LIVE_PRICE_PACK_MEDIUM} \
    VITE_PADDLE_LIVE_PRICE_PACK_LARGE=${VITE_PADDLE_LIVE_PRICE_PACK_LARGE} \
    VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY} \
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

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build

EXPOSE 8080

# Playwright image ships with a non-root `pwuser`. Chown app dir so the
# user can read it; Chromium itself refuses to run as root anyway.
RUN chown -R pwuser:pwuser /app
USER pwuser

CMD ["npm", "run", "start"]
