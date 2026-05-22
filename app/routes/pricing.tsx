import { useNavigate } from "react-router";
import type { Route } from "./+types/pricing";
import {
  PricingScreen,
  type PackKey,
  type PricingTierKey,
} from "../motionflow/screens/pricing";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Pricing — AI product video plans · Videly",
    description:
      "AI product video pricing for Videly. Start free with 3,100 credits, or scale up to 60,000 credits a month for launch and feature-announcement videos. Cancel anytime.",
    path: "/pricing",
  });
}

export default function PricingRoute() {
  const navigate = useNavigate();

  const handleSelectTier = (tier: PricingTierKey, pack: PackKey) => {
    if (tier === "free") {
      navigate("/register");
      return;
    }
    // Checkout route reads plan/pack from the query string — see
    // app/routes/checkout.tsx loader. Pack is omitted when "none" so the
    // URL stays clean for the common case (no add-on).
    const params = new URLSearchParams({ plan: tier });
    if (pack !== "none") params.set("pack", pack);
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <PricingScreen
      onSelectTier={handleSelectTier}
      onBack={() => navigate("/")}
      onCta={() => navigate("/register")}
      onSignIn={() => navigate("/signin")}
    />
  );
}
