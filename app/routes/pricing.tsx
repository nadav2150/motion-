import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/pricing";
import {
  PricingScreen,
  type PackKey,
  type PricingTierKey,
} from "../motionflow/screens/pricing";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Pricing — AI product video plans · Videly",
    description:
      "AI product video pricing for Videly. Start free with 3,100 credits, or scale up to 60,000 credits a month for launch and feature-announcement videos. Cancel anytime.",
    path: "/pricing",
  });
}

type LoaderData = { isAuthed: boolean };

// Soft auth check — never redirects, only adapts the header CTA.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function PricingRoute() {
  const navigate = useNavigate();
  const { isAuthed } = useLoaderData() as LoaderData;

  const handleSelectTier = (tier: PricingTierKey, pack: PackKey) => {
    if (tier === "free") {
      navigate(isAuthed ? "/home" : "/register");
      return;
    }
    // Checkout route reads plan/pack from the query string — see
    // app/routes/checkout.tsx loader. Pack is omitted when "none" so the
    // URL stays clean for the common case (no add-on).
    const params = new URLSearchParams({ plan: tier });
    if (pack !== "none") params.set("pack", pack);
    navigate(`/checkout?${params.toString()}`);
  };

  return <PricingScreen isAuthed={isAuthed} onSelectTier={handleSelectTier} />;
}
