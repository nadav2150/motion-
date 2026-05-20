import { useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/checkout";
import {
  CheckoutScreen,
  type CheckoutTier,
  type CheckoutPack,
} from "../motionflow/screens/checkout";
import { requireUserOrRedirect } from "../lib/auth";
import { openPaddleCheckout, priceIdForPack, priceIdForTier } from "../lib/paddle-client";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Checkout — MotionFlow AI" },
    { name: "description", content: "Complete your MotionFlow upgrade." },
  ];
}

type LoaderData = {
  user: { id: string; email: string; name: string | null };
};

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserOrRedirect(request);
  if (!user.email) {
    headers.set("Location", "/signin");
    throw new Response(null, { status: 302, headers });
  }
  return Response.json(
    { user: { id: user.id, email: user.email, name: user.name } } satisfies LoaderData,
    { headers },
  );
}

function isTier(v: string | null): v is CheckoutTier {
  return v === "starter" || v === "pro" || v === "studio";
}

function isPack(v: string | null): v is CheckoutPack {
  return v === "small" || v === "medium" || v === "large";
}

export default function CheckoutRoute() {
  const { user } = useLoaderData() as LoaderData;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tierParam = searchParams.get("plan");
  const tier: CheckoutTier = isTier(tierParam) ? tierParam : "pro";
  // Optional credit-pack add-on carried from /pricing. Omitted from the URL
  // when the user picked "none" on the slider, so the absence here means
  // subscription-only checkout.
  const packParam = searchParams.get("pack");
  const pack: CheckoutPack | null = isPack(packParam) ? packParam : null;

  const [first, last] = (user.name ?? "").split(/\s+/);
  const [submitting, setSubmitting] = useState(false);

  async function handleComplete() {
    setSubmitting(true);
    try {
      const priceId = priceIdForTier(tier);
      if (!priceId) {
        alert(`No Paddle price configured for tier "${tier}". Set VITE_PADDLE_PRICE_${tier.toUpperCase()} in .env.`);
        return;
      }
      // Resolve the optional pack add-on. We treat a missing pack price as a
      // soft warning: the subscription still goes through, the pack just
      // gets dropped from the cart.
      let extraItems: { priceId: string; quantity: number }[] = [];
      if (pack) {
        const packPriceId = priceIdForPack(pack);
        if (!packPriceId) {
          console.warn(
            `[checkout] no Paddle price configured for pack "${pack}". ` +
              `Set VITE_PADDLE_PRICE_PACK_${pack.toUpperCase()} in .env. ` +
              `Continuing with subscription only.`,
          );
        } else {
          extraItems = [{ priceId: packPriceId, quantity: 1 }];
        }
      }

      const res = await fetch("/api/billing/customer", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Customer endpoint failed (${res.status})`);
      }
      const { customerId } = (await res.json()) as { customerId: string };

      await openPaddleCheckout({
        priceId,
        extraItems,
        customerId,
        customData: {
          userId: user.id,
          kind: "subscription",
          planTier: tier,
          // packKey is included so the Paddle webhook handler can attribute
          // the pack purchase to this subscription transaction without
          // re-deriving it from the line items.
          packKey: pack ?? null,
        },
        successUrl: `${window.location.origin}/home?upgraded=${tier}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[checkout] failed to open Paddle overlay:", msg);
      alert(`Could not open checkout: ${msg}`);
    } finally {
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
      onBack={() => navigate(-1)}
      onComplete={handleComplete}
    />
  );
}
