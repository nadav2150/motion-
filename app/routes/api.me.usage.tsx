import type { Route } from "./+types/api.me.usage";
import { requireUserApi } from "../lib/auth";
import { getOrCreateBilling } from "../lib/billing/credits";

const PLAN_NAMES: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", studio: "Studio" };

// GET /api/me/usage → { planTier, planName, creditsBalance, creditsMonthly }
export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  try {
    const b = await getOrCreateBilling(user.id);
    return Response.json(
      {
        planTier: b.plan_tier,
        planName: PLAN_NAMES[b.plan_tier] ?? b.plan_tier,
        creditsBalance: Number(b.credits_balance),
        creditsMonthly: Number(b.monthly_grant),
      },
      { headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500, headers });
  }
}
