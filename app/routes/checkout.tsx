import { useEffect, useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/checkout";
import {
  CheckoutScreen,
  type CheckoutTier,
  type CheckoutPack,
  type CheckoutPlanChange,
} from "../motionflow/screens/checkout";
import { requireUserOrRedirect } from "../lib/auth";
import { AlreadySubscribedError, changePlan, startCheckout } from "../lib/billing/checkout-client";
import { PLANS, isPack, isTier } from "../lib/billing/catalog";
import { findActiveSubscription } from "../lib/billing/subscription";
import { changeDirection, estimateChargeToday, remainingFraction } from "../lib/billing/plan-change";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Checkout — Videly AI" },
    { name: "description", content: "Complete your Videly upgrade." },
  ];
}

type LoaderData = {
  user: { id: string; email: string; name: string | null };
  // The user's live subscription, so a plan pick becomes an in-place switch
  // instead of a second subscription.
  subscription: {
    tier: CheckoutTier;
    provider: "polar" | "dodo";
    remainingFraction: number;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserOrRedirect(request);
  if (!user.email) {
    headers.set("Location", "/signin");
    throw new Response(null, { status: 302, headers });
  }
  const sub = await findActiveSubscription(user.id).catch(() => null);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const pack = url.searchParams.get("pack");
  // Already on the requested plan with nothing to add: nothing to buy here.
  if (sub && sub.planTier === plan && !isPack(pack)) {
    headers.set("Location", "/settings?tab=plans");
    throw new Response(null, { status: 302, headers });
  }
  return Response.json(
    {
      user: { id: user.id, email: user.email, name: user.name },
      subscription:
        sub && isTier(sub.planTier)
          ? {
              tier: sub.planTier,
              provider: sub.provider,
              remainingFraction: remainingFraction(sub.currentPeriodStart, sub.currentPeriodEnd),
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            }
          : null,
    } satisfies LoaderData,
    { headers },
  );
}

function PackRedirect({ pack, source }: { pack: CheckoutPack; source: string | null }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    startCheckout({ pack, source }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [pack, source]);
  return (
    <div className="vd-root flex min-h-screen items-center justify-center bg-[#060c11] p-6 text-center font-sans text-paper">
      {error ? (
        <div>
          <p className="font-semibold">Could not open checkout</p>
          <p className="mt-1 text-sm text-silver">{error}</p>
          <a href="/pricing" className="mt-4 inline-block text-sm font-semibold text-coral">
            Back to pricing
          </a>
        </div>
      ) : (
        <p className="text-sm text-silver">Opening secure checkout…</p>
      )}
    </div>
  );
}

export default function CheckoutRoute() {
  const { user, subscription } = useLoaderData() as LoaderData;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tierParam = searchParams.get("plan");
  const source = searchParams.get("source");
  // Optional credit-pack add-on carried from /pricing. Omitted from the URL
  // when the user picked "none" on the slider, so the absence here means
  // subscription-only checkout.
  const packParam = searchParams.get("pack");
  const pack: CheckoutPack | null = isPack(packParam) ? packParam : null;

  const [first, last] = (user.name ?? "").split(/\s+/);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pack-only top-up (/checkout?pack=medium, or a pack for the plan the user
  // already has): straight to hosted checkout, no plan layout to render.
  const packOnly = pack && (!isTier(tierParam) || subscription?.tier === tierParam);
  if (packOnly) return <PackRedirect pack={pack} source={source} />;

  const tier: CheckoutTier = isTier(tierParam) ? tierParam : "pro";
  const planChange: CheckoutPlanChange | null =
    subscription && subscription.tier !== tier
      ? {
          fromLabel: PLANS[subscription.tier].label,
          direction: changeDirection(subscription.tier, tier),
          estimateUsd: estimateChargeToday(subscription.provider, subscription.tier, tier, subscription.remainingFraction),
        }
      : null;

  async function handleComplete() {
    setSubmitting(true);
    setError(null);
    try {
      if (planChange) {
        await changePlan(tier, source ?? "checkout");
        // A pack picked alongside rides a separate one-time checkout.
        if (pack) await startCheckout({ pack, source: source ?? "checkout" });
        else navigate(`/home?upgraded=${tier}${source ? `&source=${encodeURIComponent(source)}` : ""}`);
        return;
      }
      await startCheckout({ tier, pack, source });
      // startCheckout redirects on success; nothing else runs on this page.
    } catch (err) {
      if (err instanceof AlreadySubscribedError) {
        // Subscription appeared since the page loaded: reload into switch mode.
        window.location.reload();
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[checkout] failed:", msg);
      setError(`Could not complete checkout: ${msg}`);
      setSubmitting(false);
    }
  }

  return (
    <CheckoutScreen
      tier={tier}
      pack={pack}
      email={user.email}
      firstName={first || undefined}
      lastName={last || undefined}
      submitting={submitting}
      planChange={planChange}
      error={
        error ??
        (planChange && subscription?.cancelAtPeriodEnd
          ? "Your current plan is set to cancel. Resume it in Settings → Plans before switching."
          : null)
      }
      onBack={() => navigate(-1)}
      onComplete={handleComplete}
    />
  );
}
