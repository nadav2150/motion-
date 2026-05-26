// Hooks that wire PostHog page-view + identify lifecycle to React Router 7
// navigation and the root loader's user object.
//
// usePostHogPageviews() fires `$pageview` on every location change, including
// the initial mount, because posthog-js is configured with capture_pageview:
// false (see app/lib/posthog-client.ts). posthog-js auto-fills $current_url,
// $pathname, $referrer, and UTM params from window.location at capture time.
//
// usePostHogIdentify(user) keeps the distinctId in sync with auth: identify
// to the Supabase user.id when signed in, reset() on signout so the next
// anonymous visitor gets a fresh distinctId rather than inheriting the
// previous user's identity.

import { useEffect } from "react";
import { useLocation } from "react-router";
import { getPostHogBrowser } from "./posthog-client";

export function usePostHogPageviews(): void {
  const location = useLocation();
  useEffect(() => {
    const ph = getPostHogBrowser();
    if (!ph) return;
    ph.capture("$pageview");
  }, [location.pathname, location.search, location.hash]);
}

export function usePostHogIdentify(
  user: { id: string; email?: string | null } | null,
): void {
  useEffect(() => {
    const ph = getPostHogBrowser();
    if (!ph) return;
    if (user) {
      ph.identify(user.id, user.email ? { email: user.email } : undefined);
    } else {
      ph.reset();
    }
  }, [user?.id]);
}
