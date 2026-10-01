import type { Route } from "./+types/api.me.usage";
import { requireUserApi } from "../lib/auth";
import { getOrCreateBilling } from "../lib/billing/credits";
import { getPlanFeatures } from "../lib/billing/plan-features";
import { findActiveSubscription } from "../lib/billing/subscription";
import { remainingFraction } from "../lib/billing/plan-change";
import { estimateStudioJob } from "../lib/studio/estimate";

const PLAN_NAMES: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", studio: "Studio" };

// Credits a typical next video costs on this plan: the plan's shortest default
// (15s), with voiceover when the plan allows audio. Drives the low-credit
// banner and the upsell modal's "enough for N videos" copy.
function nextVideoCost(tier: string): number {
  const f = getPlanFeatures(tier);
  return estimateStudioJob({
    targetDuration: 15,
    maxDuration: Math.min(f.maxStudioDuration, 20),
    voiceover: f.audio,
    music: f.audio,
    reference: false,
  }).total;
}

// GET /api/me/usage → { planTier, planName, creditsBalance, creditsMonthly,
//   creditsReserved, nextVideoCost, lowCredit, features, subscription }
export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  try {
    const b = await getOrCreateBilling(user.id);
    // Subscription state is a nice-to-have for the upsell UI; never fail the
    // whole usage call over it.
    const sub = await findActiveSubscription(user.id).catch(() => null);
    const f = getPlanFeatures(b.plan_tier);
    const balance = Number(b.credits_balance);
    const cost = nextVideoCost(b.plan_tier);
    return Response.json(
      {
        planTier: b.plan_tier,
        planName: PLAN_NAMES[b.plan_tier] ?? b.plan_tier,
        creditsBalance: balance,
        creditsMonthly: Number(b.monthly_grant),
        creditsReserved: Number(b.credits_reserved ?? 0),
        nextVideoCost: cost,
        lowCredit: balance < cost,
        features: {
          watermark: f.watermark,
          export4k: f.export4k,
          audio: f.audio,
          maxStudioDuration: f.maxStudioDuration,
          maxScriptChars: f.maxScriptChars,
        },
        subscription: sub
          ? {
              tier: sub.planTier,
              provider: sub.provider,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              periodEnd: sub.currentPeriodEnd,
              remainingFraction: remainingFraction(sub.currentPeriodStart, sub.currentPeriodEnd),
            }
          : null,
      },
      { headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500, headers });
  }
}
