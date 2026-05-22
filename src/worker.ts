// Cloudflare Workers entry that fronts the Videly container.
//
// Every request to `videly.io/*` lands here. The Worker has no business
// logic of its own — it forwards each request to a single shared container
// instance running the React Router + Node app. Cookies, websockets, and
// streaming responses all pass through transparently.
//
// `defaultPort = 8080` must match the PORT env var in the Dockerfile and
// the port `react-router-serve` binds to inside the container.
//
// Worker secrets do NOT auto-flow into the container (they're separate
// processes). `envVars` below forwards each one explicitly. Getter form
// avoids the class-field-initialization-order trap with `this.env`.

import { Container, getContainer } from "@cloudflare/containers";

type Env = {
  VIDELY_CONTAINER: DurableObjectNamespace<VidelyContainer>;
  // Server-side secrets (set via `wrangler secret bulk`).
  OPEN_AI_API_KEY: string;
  ANTROPIC_API_KEY: string;
  REPLICATE_API_TOKEN: string;
  MOTIONFLOW_LLM_DIRECTOR: string;
  MOTIONGLASS_AUTO_AUDIO: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  UNSPLASH_ACCESS_KEY: string;
  UNSPLASH_SECRET_KEY: string;
  JAMENDO_API_KEY: string;
  FREESOUND_API_KEY: string;
  FREESOUND_CLIENT_ID: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_DEFAULT_VOICE_ID: string;
  PADDLE_ENV: string;
  PADDLE_LIVE_API_KEY: string;
  PADDLE_LIVE_WEBHOOK_SECRET: string;
  PADDLE_LIVE_PRICE_STARTER: string;
  PADDLE_LIVE_PRICE_PRO: string;
  PADDLE_LIVE_PRICE_STUDIO: string;
  PADDLE_LIVE_PRICE_PACK_SMALL: string;
  PADDLE_LIVE_PRICE_PACK_MEDIUM: string;
  PADDLE_LIVE_PRICE_PACK_LARGE: string;
  POSTHOG_API_KEY: string;
  POSTHOG_PROJECT_ID: string;
};

export class VidelyContainer extends Container<Env> {
  defaultPort = 8080;

  // Keep the container warm for 15 minutes after the last request.
  // Cold-starts cost ~10s while Chromium loads; idle traffic should not
  // pay that on every request. Containers stop billing while asleep.
  sleepAfter = "15m";

  // Worker secrets must be explicitly forwarded — they do not auto-flow
  // into the container's process. This MUST be a class-field initializer
  // (not a getter), because the parent `Container` class also defines
  // `envVars = {}` as a class field. Subclass field initializers run after
  // parent ones and overwrite them; an override getter would get shadowed
  // by the parent's instance property and never run.
  envVars = {
    // Runtime config react-router-serve reads to know which interface +
    // port to bind. The Dockerfile sets these as ENV too, but the SDK's
    // container.start({ env }) call may not merge with image ENV — be
    // explicit so the container always listens on the port workerd probes.
    PORT: "8080",
    HOST: "0.0.0.0",
    NODE_ENV: "production",
    OPEN_AI_API_KEY: this.env.OPEN_AI_API_KEY,
    ANTROPIC_API_KEY: this.env.ANTROPIC_API_KEY,
    REPLICATE_API_TOKEN: this.env.REPLICATE_API_TOKEN,
    MOTIONFLOW_LLM_DIRECTOR: this.env.MOTIONFLOW_LLM_DIRECTOR,
    MOTIONGLASS_AUTO_AUDIO: this.env.MOTIONGLASS_AUTO_AUDIO,
    SUPABASE_URL: this.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: this.env.SUPABASE_SERVICE_ROLE_KEY,
    UNSPLASH_ACCESS_KEY: this.env.UNSPLASH_ACCESS_KEY,
    UNSPLASH_SECRET_KEY: this.env.UNSPLASH_SECRET_KEY,
    JAMENDO_API_KEY: this.env.JAMENDO_API_KEY,
    FREESOUND_API_KEY: this.env.FREESOUND_API_KEY,
    FREESOUND_CLIENT_ID: this.env.FREESOUND_CLIENT_ID,
    ELEVENLABS_API_KEY: this.env.ELEVENLABS_API_KEY,
    ELEVENLABS_DEFAULT_VOICE_ID: this.env.ELEVENLABS_DEFAULT_VOICE_ID,
    PADDLE_ENV: this.env.PADDLE_ENV,
    PADDLE_LIVE_API_KEY: this.env.PADDLE_LIVE_API_KEY,
    PADDLE_LIVE_WEBHOOK_SECRET: this.env.PADDLE_LIVE_WEBHOOK_SECRET,
    PADDLE_LIVE_PRICE_STARTER: this.env.PADDLE_LIVE_PRICE_STARTER,
    PADDLE_LIVE_PRICE_PRO: this.env.PADDLE_LIVE_PRICE_PRO,
    PADDLE_LIVE_PRICE_STUDIO: this.env.PADDLE_LIVE_PRICE_STUDIO,
    PADDLE_LIVE_PRICE_PACK_SMALL: this.env.PADDLE_LIVE_PRICE_PACK_SMALL,
    PADDLE_LIVE_PRICE_PACK_MEDIUM: this.env.PADDLE_LIVE_PRICE_PACK_MEDIUM,
    PADDLE_LIVE_PRICE_PACK_LARGE: this.env.PADDLE_LIVE_PRICE_PACK_LARGE,
    POSTHOG_API_KEY: this.env.POSTHOG_API_KEY,
    POSTHOG_PROJECT_ID: this.env.POSTHOG_PROJECT_ID,
  };

  override onStart(): void {
    console.log("[container] videly node server started");
  }

  override onStop(): void {
    console.log("[container] videly node server stopped");
  }

  override onError(err: unknown): void {
    console.error("[container] error:", err);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Single shared instance keeps the Chromium browser pool + Supabase
    // client warm. Per-user instances are unnecessary — auth lives in
    // signed cookies that the container's Node server validates.
    return getContainer(env.VIDELY_CONTAINER).fetch(request);
  },
};
