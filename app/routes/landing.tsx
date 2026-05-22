import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/landing";
import { LandingScreen } from "../motionflow/screens/landing";
import { getUserFromRequest } from "../lib/auth";
import { SITE_URL, buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "AI launch video generator for SaaS — Videly",
    description:
      "Videly is the AI launch video generator for SaaS teams. Turn screenshots and product updates into product motion design and feature announcement videos in minutes.",
    path: "/",
  });
}

// SoftwareApplication schema feeds Google's rich card with offers. Plan tiers
// mirror PLANS in app/motionflow/screens/pricing.tsx — keep in sync if pricing
// changes (intentionally copied not imported to avoid a screen→route coupling).
const SOFTWARE_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Videly",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "AI launch video generator that turns screenshots and product updates into motion-designed videos for SaaS launches.",
  url: SITE_URL,
  offers: [
    { "@type": "Offer", price: "0",   priceCurrency: "USD", name: "Free" },
    { "@type": "Offer", price: "19",  priceCurrency: "USD", name: "Starter" },
    { "@type": "Offer", price: "49",  priceCurrency: "USD", name: "Pro" },
    { "@type": "Offer", price: "149", priceCurrency: "USD", name: "Studio" },
  ],
});

type LoaderData = { isAuthed: boolean };

// Soft auth check — we never redirect from the landing page, just adapt
// the CTAs so a signed-in visitor sees "Open the app" instead of
// "Start free / Sign in".
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function LandingRoute() {
  const navigate = useNavigate();
  const { isAuthed } = useLoaderData() as LoaderData;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: SOFTWARE_JSONLD }}
      />
      <LandingScreen
        isAuthed={isAuthed}
        onCta={() => navigate(isAuthed ? "/home" : "/register")}
        onSignIn={() => navigate("/signin")}
      />
    </>
  );
}
