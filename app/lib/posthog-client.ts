// Browser-side PostHog bootstrap. Mirrors the server-side stub pattern in
// app/lib/posthog.ts: when VITE_POSTHOG_KEY is unset (local dev without a
// .env override), bootstrapPostHog() is a silent no-op and getPostHogBrowser()
// returns null. SSR-safe — both functions short-circuit when window is
// undefined so they can be called from the root layout without breaking
// hydration.
//
// Config rationale:
//   • capture_pageview: false — we fire $pageview manually from
//     usePostHogPageviews() because PostHog's built-in auto-capture only
//     fires on full reloads, missing every React Router client navigation.
//   • autocapture: false — current scope is page views only; no click/form
//     events. Re-enable later if heatmaps or click funnels are needed.
//   • disable_session_recording: true — recordings carry storage cost and a
//     privacy surface we haven't opted into.

import posthog, { type PostHog } from "posthog-js";

let initialized = false;

export function bootstrapPostHog(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  const host =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
    "https://us.i.posthog.com";
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    autocapture: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

export function getPostHogBrowser(): PostHog | null {
  if (typeof window === "undefined") return null;
  if (!initialized) return null;
  return posthog;
}
