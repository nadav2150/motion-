import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/vs.pictory";
import {
  ComparisonScreen,
  type ComparisonContent,
} from "../motionflow/screens/comparison-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Videly vs Pictory — SaaS launch videos vs blog-to-video",
    description:
      "Pictory turns long-form articles into stock-footage videos for content marketing. Videly turns screenshots and scripts into motion-designed launch videos for SaaS. Compare both.",
    path: "/vs/pictory",
  });
}

const CONTENT: ComparisonContent = {
  competitor: "Pictory",
  headline: "Videly vs Pictory — SaaS launch videos vs",
  headlineHighlight: "blog-to-video.",
  lede:
    "Pictory targets content marketers turning long-form articles into stock-footage explainers and social clips. Videly targets product teams turning screenshots and launch scripts into motion-designed product videos. Different inputs, different outputs, different buyers.",
  videlySummary:
    "AI launch video generator for SaaS. Composes YOUR screenshots into motion-designed scenes — every frame is the actual product, not stock footage.",
  competitorSummary:
    "AI video summariser for content marketers. Turns blog posts, scripts, and long videos into short stock-footage clips with auto voice-over and captions.",
  rows: [
    { feature: "Primary input", videly: "Screenshots + launch script", competitor: "Blog post / script / long video" },
    { feature: "Primary output", videly: "Product motion video", competitor: "Stock-footage explainer video" },
    { feature: "Uses your product UI", videly: "Yes (core)", competitor: "Stock footage only" },
    { feature: "Stock-footage library", videly: "No (your assets only)", competitor: "Yes (Storyblocks)" },
    { feature: "Brand kit (colours + logo)", videly: "Yes", competitor: "Yes" },
    { feature: "AI voice-over", videly: "Yes (optional)", competitor: "Yes (60+ voices)" },
    { feature: "Captions / subtitles", videly: "Auto-generated", competitor: "Auto-generated" },
    { feature: "Best for", videly: "Launches, demos, feature drops", competitor: "Blog repurposing, content marketing" },
    { feature: "Article-to-video summarisation", videly: "No", competitor: "Yes (core feature)" },
    { feature: "Free tier", videly: "3,100 credits/mo", competitor: "3 projects, watermark" },
    { feature: "Cheapest paid plan", videly: "$19/mo", competitor: "$25/mo (Starter, annual)" },
  ],
  picks: [
    {
      who: "Pick Videly when",
      bullets: [
        "The video is a launch, demo, or feature announcement for your SaaS",
        "It needs to show your actual product UI in motion",
        "You're shipping product updates weekly and need a video per release",
        "Stock footage would feel generic for what you're announcing",
        "Brand consistency across every product video is important",
      ],
    },
    {
      who: "Pick Pictory when",
      bullets: [
        "You're turning blog posts into short-form social videos",
        "You need YouTube shorts / Reels / TikToks from long-form content",
        "Stock footage matches your content style (lifestyle, news, B-roll)",
        "Your audience is content-marketing-driven, not product-driven",
        "You want to summarise a 30-minute podcast into a 60-second teaser",
      ],
    },
  ],
  closing:
    "If you're doing content marketing, Pictory is the better tool. If you're doing product marketing — launches, demos, feature videos — Videly is built for that job. Some teams use both: Pictory for the blog repurposing, Videly for the launch videos.",
};

type LoaderData = { isAuthed: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function VsPictoryRoute() {
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
