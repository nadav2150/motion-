import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/vs.runway";
import {
  ComparisonScreen,
  type ComparisonContent,
} from "../motionflow/screens/comparison-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Videly vs Runway — product motion vs generative video",
    description:
      "Runway generates cinematic video from text and images. Videly generates motion-designed product videos from your screenshots and brand kit. Compare what each is built for.",
    path: "/vs/runway",
  });
}

const CONTENT: ComparisonContent = {
  competitor: "Runway",
  headline: "Videly vs Runway — product motion design vs",
  headlineHighlight: "generative video.",
  lede:
    "Runway's Gen-series models generate cinematic video from a text prompt or reference image — useful for creative agencies, filmmakers, and ad creative. Videly is product-software-shaped: it works from your real screenshots, brand kit, and launch script, not from imagination.",
  videlySummary:
    "AI launch video generator built for SaaS. Composes your screenshots into motion-designed scenes — never invents UI that doesn't exist. Brand kit + captions + export presets included.",
  competitorSummary:
    "Generative AI video studio. Gen-series models produce cinematic clips from text prompts, reference images, or input video. Best-in-class for creative agencies and filmmakers.",
  rows: [
    { feature: "Primary output", videly: "Product motion video", competitor: "Generative cinematic clip" },
    { feature: "Source material", videly: "Your screenshots + script", competitor: "Text prompt / reference image / video" },
    { feature: "Renders YOUR product UI", videly: "Yes (exactly)", competitor: "Approximation only" },
    { feature: "Risk of hallucinated UI", videly: "None", competitor: "High — generative model" },
    { feature: "Brand kit (colours + logo)", videly: "Yes", competitor: "Manual via reference images" },
    { feature: "Best for", videly: "Launches, demos, feature videos", competitor: "Creative ads, music videos, film B-roll" },
    { feature: "Generates novel scenes from text", videly: "No", competitor: "Yes (Gen-3)" },
    { feature: "Generates UI walkthroughs from screenshots", videly: "Yes", competitor: "No" },
    { feature: "Captions / subtitles", videly: "Auto-generated", competitor: "Manual" },
    { feature: "Free tier", videly: "3,100 credits/mo", competitor: "525 credits one-time" },
    { feature: "Cheapest paid plan", videly: "$19/mo", competitor: "$15/mo (Standard)" },
  ],
  picks: [
    {
      who: "Pick Videly when",
      bullets: [
        "The video has to show your real product — not a hallucinated approximation",
        "You're making a launch, demo, or feature announcement video",
        "Brand consistency across every video matters",
        "You want a one-paragraph script to become a full motion-designed video",
        "You don't want to learn prompt engineering for video generation",
      ],
    },
    {
      who: "Pick Runway when",
      bullets: [
        "You're making creative or cinematic content (ads, music videos, film B-roll)",
        "You need to generate novel imagery that doesn't exist in your asset library",
        "You're comfortable iterating on prompts to get the shot you want",
        "You want video-to-video editing (style transfer, in-painting, motion brushes)",
        "Your output is meant to look generated, not literal",
      ],
    },
  ],
  closing:
    "Different problems entirely. Runway is creative-first generative video. Videly is product-first motion design. If you ever tried to use Runway to make a SaaS demo and got hallucinated UI, you already know why these tools belong in different folders.",
};

type LoaderData = { isAuthed: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function VsRunwayRoute() {
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
