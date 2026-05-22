// Lazy server-side PostHog client. Used by app/lib/billing/track-cost.ts to
// emit `model_cost` events per external-API call.
//
// When POSTHOG_API_KEY is unset (local dev, smoke tests), getPostHog() returns
// a no-op stub so nothing fails — the Supabase ledger remains the source of
// truth in that path.
//
// Why server-side: every model call already happens in runJob() on the server,
// so we get user_id + job_id + plan_tier ambient via AsyncLocalStorage without
// shipping any analytics shim to the client.

import { PostHog } from "posthog-node";

type PostHogLike = {
  capture(args: { distinctId: string; event: string; properties?: Record<string, unknown> }): void;
  identify(args: { distinctId: string; properties?: Record<string, unknown> }): void;
  shutdown(): Promise<void>;
};

const NOOP_CLIENT: PostHogLike = {
  capture() {
    // no-op
  },
  identify() {
    // no-op
  },
  async shutdown() {
    // no-op
  },
};

let cached: PostHogLike | null = null;

export function getPostHog(): PostHogLike {
  if (cached) return cached;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    cached = NOOP_CLIENT;
    return cached;
  }
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  // Server-side: small flush interval so events land quickly even if the
  // process exits between jobs. flushAt=1 keeps buffer pressure low; the
  // explicit flushPostHog() in runJob() finally covers serverless cold-stop.
  cached = new PostHog(key, {
    host,
    flushAt: 1,
    flushInterval: 5_000,
  });
  return cached;
}

// Call from runJob() finally so events buffered in-memory aren't dropped when
// the serverless function unloads. Safe to call on the no-op stub.
export async function flushPostHog(): Promise<void> {
  if (!cached) return;
  try {
    await cached.shutdown();
  } catch (err) {
    console.error("[posthog] flush failed:", err instanceof Error ? err.message : err);
  } finally {
    // Next request rebuilds — shutdown() invalidates the client.
    cached = null;
  }
}
