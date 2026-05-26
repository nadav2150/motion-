import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/vs.veed";
import {
  ComparisonScreen,
  type ComparisonContent,
} from "../motionflow/screens/comparison-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Videly vs Veed — AI launch videos vs online editor",
    description:
      "Veed is a full-featured online video editor with AI helpers. Videly is an AI-first generator that produces motion-designed launch videos without manual editing. Compare both.",
    path: "/vs/veed",
  });
}

const CONTENT: ComparisonContent = {
  competitor: "Veed",
  headline: "Videly vs Veed — generative launch videos vs",
  headlineHighlight: "manual editor.",
  lede:
    "Veed is one of the best browser-based video editors — full timeline, every tool, generous free tier, AI helpers bolted on. Videly is the opposite shape: you describe the launch video you want and it's generated for you, with the timeline available only for tweaks. Editor-first vs generator-first.",
  videlySummary:
    "AI launch video generator. Script + screenshots → motion-designed video. You can tweak the timeline, but you don't have to start from a blank one.",
  competitorSummary:
    "Browser-based video editor with AI helpers. Full timeline, screen recorder, subtitles, background remover, voice clone, teleprompter. Best-in-class for hands-on editing.",
  rows: [
    { feature: "Workflow", videly: "Describe → generated", competitor: "Edit on a timeline" },
    { feature: "Starts from a blank timeline", videly: "No", competitor: "Yes" },
    { feature: "Storyboard from a script", videly: "Yes (core)", competitor: "No" },
    { feature: "Motion presets tuned for SaaS UI", videly: "Yes", competitor: "Generic transitions" },
    { feature: "Brand kit (colours + logo)", videly: "Yes", competitor: "Yes (Pro+)" },
    { feature: "AI voice-over", videly: "Yes", competitor: "Yes (voice clone)" },
    { feature: "Auto-captions", videly: "Yes", competitor: "Yes" },
    { feature: "Screen recorder", videly: "No", competitor: "Yes" },
    { feature: "Manual editor when you want one", videly: "Yes (tweak)", competitor: "Yes (primary)" },
    { feature: "Best for", videly: "Launches, demos, feature videos", competitor: "All-purpose video editing" },
    { feature: "Free tier", videly: "3,100 credits/mo", competitor: "10-min uploads, watermark" },
    { feature: "Cheapest paid plan", videly: "$19/mo", competitor: "$12/mo (Basic, annual)" },
  ],
  picks: [
    {
      who: "Pick Videly when",
      bullets: [
        "You don't want to learn a video editor",
        "You ship launches or feature announcements regularly and want each one to look designed",
        "Your default expectation is \"the AI does it; I review and ship\"",
        "Brand kit applied automatically across every video matters",
        "You want a strong starting point in 10 minutes, not a blank canvas",
      ],
    },
    {
      who: "Pick Veed when",
      bullets: [
        "You already know video editing and want a powerful browser-based tool",
        "You need a screen recorder + editor in one place",
        "You're editing podcast clips, talking-head videos, or repurposed content",
        "You want voice cloning, teleprompter, and background removal",
        "Generative output isn't a fit — you need fine-grained manual control",
      ],
    },
  ],
  closing:
    "If you're a hands-on editor, Veed is excellent and you'll be happy there. If you'd rather describe what you want and have it generated — with a timeline available only when you want to tweak — that's Videly. They're different tools for different temperaments.",
};

type LoaderData = { isAuthed: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function VsVeedRoute() {
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
