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
//   • session_recording — enabled. All <input> values are masked by default
//     so emails, passwords, and card fields don't leak into the replay.
//     Mark any extra element private with `data-private` on the DOM node;
//     PostHog will blur it in the replay. Conversely, add `data-ph-no-mask`
//     to an input you DO want visible (e.g. a benign filter box).
//     NOTE: PostHog Cloud's Session Replay add-on must also be enabled at
//     PostHog → Settings → Session Replay, otherwise recordings are sent
//     by the client but discarded server-side.

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
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
    },
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

export function getPostHogBrowser(): PostHog | null {
  if (typeof window === "undefined") return null;
  if (!initialized) return null;
  return posthog;
}
