// Loader-side helpers for surfacing billing state in the UI shell.

import { getOrCreateBilling } from "./credits";

export type UICreditsState = {
  credits: number | null;
  planTier: string | null;
};

// Resolves the user's current credit balance and plan tier for AppChrome
// routes. Both come from the same user_billing row — one DB round-trip.
// Never throws; on error returns nulls so the page still renders (credits
// pill hides, plan-gated UI defaults to the most-locked state). Routes
// rendering AppChrome should call this and forward both fields to their
// screen.
export async function loadCreditsForUI(userId: string): Promise<UICreditsState> {
  try {
    const billing = await getOrCreateBilling(userId);
    return {
      credits: billing.credits_balance,
      planTier: billing.plan_tier,
    };
  } catch (err) {
    console.error(
      `[billing] loadCreditsForUI(${userId}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return { credits: null, planTier: null };
  }
}
