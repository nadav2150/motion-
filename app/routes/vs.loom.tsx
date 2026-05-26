import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/vs.loom";
import {
  ComparisonScreen,
  type ComparisonContent,
} from "../motionflow/screens/comparison-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Videly vs Loom — AI launch videos vs screen recordings",
    description:
      "Loom is great for ad-hoc screen recordings. Videly generates motion-designed launch and product videos. Compare side by side and pick the right tool for the job.",
    path: "/vs/loom",
  });
}

const CONTENT: ComparisonContent = {
  competitor: "Loom",
  headline: "Videly vs Loom — when you need a launch video, not a",
  headlineHighlight: "screen recording.",
  lede:
    "Loom and Videly look similar from a distance — both produce videos for SaaS teams. They're built for completely different jobs. Loom is the fastest path to an async screen recording. Videly is the fastest path to a motion-designed launch or feature video that goes on your landing page.",
  videlySummary:
    "AI launch video generator for SaaS. Turns screenshots and a short script into a motion-designed video with brand kit, captions, and export presets for X / LinkedIn / Product Hunt.",
  competitorSummary:
    "Async screen-recording and messaging platform. Record your screen + webcam, share a link, get reactions inline. Best-in-class for internal team comms and customer support replies.",
  rows: [
    { feature: "Primary output", videly: "Motion-designed video", competitor: "Screen recording" },
    { feature: "Best for", videly: "Launch + feature videos, landing-page demos", competitor: "Async team comms, support replies, casual demos" },
    { feature: "Brand kit (colours + logo)", videly: "Yes", competitor: "No" },
    { feature: "Generates scenes from a script", videly: "Yes", competitor: "No" },
    { feature: "AI voice-over", videly: "Yes (optional)", competitor: "No" },
    { feature: "Captions / subtitles", videly: "Auto-generated", competitor: "Auto-generated" },
    { feature: "Real-time recording", videly: "No", competitor: "Yes" },
    { feature: "Async link sharing + reactions", videly: "No", competitor: "Yes" },
    { feature: "Aspect-ratio presets (1:1 / 9:16 / 16:9)", videly: "Yes", competitor: "16:9 only" },
    { feature: "Free tier", videly: "3,100 credits / month", competitor: "25 videos, 5-min cap" },
    { feature: "Cheapest paid plan", videly: "$19/mo", competitor: "$15/mo (Business)" },
  ],
  picks: [
    {
      who: "Pick Videly when",
      bullets: [
        "You're shipping a launch and need a video for the landing-page hero",
        "Your changelog deserves a 20-second motion-designed clip per release",
        "You want a video your sales team can paste into outbound — not a raw recording",
        "You care about brand consistency across every video you ship",
        "You need 9:16 vertical for App Store, Reels, or Product Hunt gallery",
      ],
    },
    {
      who: "Pick Loom when",
      bullets: [
        "You need to record-and-send in under 60 seconds",
        "It's an internal team comms or async standup replacement",
        "You're replying to a customer support ticket with a quick walkthrough",
        "You want viewer reactions and comments inline on the playback",
        "The audience is one person, not your whole landing page",
      ],
    },
  ],
  closing:
    "Most SaaS teams end up using both — Loom for the daily async stuff, Videly for the videos that live on the landing page, App Store, and outbound sequences. They're complements, not alternatives.",
};

type LoaderData = { isAuthed: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function VsLoomRoute() {
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
