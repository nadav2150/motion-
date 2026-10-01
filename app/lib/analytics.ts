// Typed client-side product events for the upsell / checkout funnel. Thin
// wrapper over the browser PostHog instance; a silent no-op when PostHog isn't
// configured or during SSR.
//
// Funnel: paywall_viewed → upsell_cta_clicked → checkout_started (client)
//   → checkout_session_created (server) → *_credits_applied / credit_pack_purchased
//   / subscription_plan_changed (webhooks) → purchase_completed_client.

import { getPostHogBrowser } from "./posthog-client";

export type UpsellEvent =
  | "paywall_viewed"
  | "paywall_dismissed"
  | "upsell_cta_clicked"
  | "checkout_started"
  | "checkout_failed"
  | "checkout_blocked_already_subscribed"
  | "plan_change_requested"
  | "plan_change_succeeded"
  | "plan_change_failed"
  | "purchase_completed_client"
  | "low_credit_banner_viewed"
  | "low_credit_banner_dismissed"
  | "low_credit_banner_clicked"
  | "locked_feature_clicked"
  | "first_preview_ready";

export function track(event: UpsellEvent, props: Record<string, unknown> = {}): void {
  try {
    getPostHogBrowser()?.capture(event, props);
  } catch {
    // analytics must never break the UI
  }
}
