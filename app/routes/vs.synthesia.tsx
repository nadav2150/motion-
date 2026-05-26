import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/vs.synthesia";
import {
  ComparisonScreen,
  type ComparisonContent,
} from "../motionflow/screens/comparison-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Videly vs Synthesia — product motion vs AI avatars",
    description:
      "Synthesia generates videos with AI avatars and voiceovers. Videly generates motion-designed product and launch videos from your screenshots. Different jobs — compare side by side.",
    path: "/vs/synthesia",
  });
}

const CONTENT: ComparisonContent = {
  competitor: "Synthesia",
  headline: "Videly vs Synthesia — product motion design vs",
  headlineHighlight: "AI avatars.",
  lede:
    "Synthesia is the leader in AI-avatar talking-head videos — useful for training, onboarding, and corporate explainers. Videly is built for the other half of the video market: launch videos, feature announcements, and product demos that show the actual product moving on screen, not a synthetic presenter.",
  videlySummary:
    "AI launch and product video generator for SaaS. Screenshots + brand kit + short script → motion-designed video. No avatars — the product is the star.",
  competitorSummary:
    "AI video platform with 230+ photorealistic avatars and 140+ languages. Best-in-class for talking-head explainer videos, employee training, and localised corporate content.",
  rows: [
    { feature: "Primary output", videly: "Product motion video", competitor: "AI avatar talking-head video" },
    { feature: "Uses your screenshots", videly: "Yes (core input)", competitor: "Limited (B-roll only)" },
    { feature: "AI avatars", videly: "No", competitor: "230+ avatars" },
    { feature: "AI voice-over", videly: "Yes (optional)", competitor: "Yes (built-in)" },
    { feature: "Languages supported", videly: "Captions in any (Whisper)", competitor: "140+ languages" },
    { feature: "Brand kit (colours + logo)", videly: "Yes, per project", competitor: "Yes, brand library" },
    { feature: "Best for", videly: "Launches, demos, feature drops", competitor: "Training, onboarding, localised explainers" },
    { feature: "Avatar of a real person", videly: "N/A", competitor: "Yes (custom avatar)" },
    { feature: "Aspect-ratio presets", videly: "16:9 / 9:16 / 1:1", competitor: "16:9 / 9:16 / 1:1" },
    { feature: "Free tier", videly: "3,100 credits/mo", competitor: "3 minutes/mo" },
    { feature: "Cheapest paid plan", videly: "$19/mo", competitor: "$29/mo (Starter)" },
  ],
  picks: [
    {
      who: "Pick Videly when",
      bullets: [
        "You want to show your product UI in motion, not a presenter talking about it",
        "You're shipping SaaS launches and need a video for landing pages, App Store, and X",
        "Your changelog needs a weekly motion-designed announcement video",
        "Your brand voice is product-led, not corporate-explainer",
        "You don't want an AI avatar in your launch video",
      ],
    },
    {
      who: "Pick Synthesia when",
      bullets: [
        "You're producing employee training, HR onboarding, or compliance videos",
        "You need the same script localised into 20+ languages with native voice-overs",
        "A presenter talking on camera is core to the format",
        "You want a consistent avatar persona across every video you ship",
        "Your audience is internal-comms or B2B-corporate, not consumer-facing product",
      ],
    },
  ],
  closing:
    "Both are AI video tools, but they target different videos. If the asset that matters is the product on screen, that's Videly. If the asset that matters is a person on screen explaining something in your second language, that's Synthesia.",
};

type LoaderData = { isAuthed: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function VsSynthesiaRoute() {
  const navigate = useNavigate();
  const { isAuthed } = useLoaderData() as LoaderData;
  return (
    <ComparisonScreen
      content={CONTENT}
      isAuthed={isAuthed}
      onCta={() => navigate(isAuthed ? "/home" : "/register")}
      onSignIn={() => navigate("/signin")}
    />
  );
}
