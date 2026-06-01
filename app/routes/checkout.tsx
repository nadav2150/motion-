import { useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/checkout";
import {
  CheckoutScreen,
  type CheckoutTier,
  type CheckoutPack,
} from "../motionflow/screens/checkout";
import { requireUserOrRedirect } from "../lib/auth";
import { startCheckout } from "../lib/billing/checkout-client";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Checkout — Videly AI" },
    { name: "description", content: "Complete your Videly upgrade." },
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
      await startCheckout({ tier, pack });
      // startCheckout redirects on success; nothing else runs on this page.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[checkout] failed to start Polar checkout:", msg);
      alert(`Could not open checkout: ${msg}`);
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
