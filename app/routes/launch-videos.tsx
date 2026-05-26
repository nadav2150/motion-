import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/launch-videos";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "AI launch video generator — Videly",
    description:
      "Make a SaaS launch video without an editor or motion designer. Videly's AI launch video generator turns screenshots, scripts, and brand colours into a polished launch video in minutes.",
    path: "/launch-videos",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "LAUNCH VIDEOS · AI MOTION DESIGN",
  headline: "Ship a launch video the same day you ship the",
  headlineHighlight: "product.",
  subhead:
    "Videly is an AI launch video generator built for SaaS teams. Drop in your screenshots, paste a 1-paragraph script, and get a launch-ready video — scenes, transitions, captions, music — without hiring a motion designer.",
  heroBullets: [
    "From screenshot to launch video in under 10 minutes",
    "Brand colours + logo applied automatically",
    "Export 1080p or 4K, watermark-free on paid plans",
    "Cancel any time · no card on Free",
  ],
  problem: {
    heading: "Most launches are launched with the wrong video.",
    body:
      "You spent two months building the feature. Then launch day comes and the announcement video is a 6-second screen recording with a fade transition. The work that went in deserves more than that — but a real motion designer costs $5k–$15k per launch and won't fit your shipping cadence. Videly closes that gap: a launch video that feels designed, generated from the same artifacts your team already has lying around.",
  },
  solutions: [
    {
      title: "Storyboard from your script",
      description:
        "Paste your launch announcement. Videly's director breaks it into scenes — problem, solution, demo, CTA — and assigns the right motion presets to each.",
    },
    {
      title: "Screenshots become motion",
      description:
        "Drop in product screenshots. The renderer composes them into scenes with parallax, focus pulls, and easing tuned for SaaS UI — no After Effects required.",
    },
    {
      title: "Brand kit auto-applied",
      description:
        "Brand colours, logo, and typography pulled from your domain (or uploaded) flow into every scene so the video reads as yours, not as a template.",
    },
    {
      title: "Export everywhere",
      description:
        "1080p or 4K MP4. Crop presets for X, LinkedIn, Product Hunt, App Store, and your landing page. One render — every surface.",
    },
  ],
  examples: [
    {
      title: "Series A launch announcement",
      description:
        "30-second hero video for the funding announcement thread, plus a 6-second loop for the landing page bloom section.",
    },
    {
      title: "Public beta to GA",
      description:
        "Turn the changelog of what shipped during beta into a single 45-second video that tells the story.",
    },
    {
      title: "Product Hunt launch",
      description:
        "Vertical 9:16 trailer for the PH gallery + horizontal 16:9 for the embedded demo.",
    },
    {
      title: "Investor update",
      description:
        "A motion-designed recap of the last quarter's product progress — same source, different audience.",
    },
  ],
  faq: [
    {
      q: "How long does it take to make a launch video with Videly?",
      a: "Most users go from script + screenshots to first render in under 10 minutes. Polishing and re-rendering scenes you don't like adds another 10–20 minutes depending on how picky you are.",
    },
    {
      q: "Do I need motion design or video editing experience?",
      a: "No. Videly's director picks scene compositions and easings based on your script. You can override anything from the editor, but the default output is launch-ready.",
    },
    {
      q: "Can I use my own brand colours and logo?",
      a: "Yes. On paid plans you upload a logo + pick brand colours once. Every video you render after that pulls them in automatically — no need to set them per project.",
    },
    {
      q: "What aspect ratios does it export?",
      a: "16:9 (landing pages, YouTube), 9:16 (TikTok, Reels, PH gallery), and 1:1 (X, LinkedIn). Render once, export to all three.",
    },
    {
      q: "Will it look like AI slop?",
      a: "We optimised against this specifically. Videly uses curated motion systems inspired by premium SaaS launches rather than generic AI video models, so the output reads as motion-designed, not generated.",
    },
    {
      q: "What does it cost?",
      a: "Free tier with 3,100 credits a month — enough for one short launch video. Starter ($19/mo) is the typical plan for founders shipping launches solo. Pro and Studio scale up for teams.",
    },
  ],
};

const FAQ_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CONTENT.faq.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

type LoaderData = { isAuthed: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function LaunchVideosRoute() {
  const navigate = useNavigate();
  const { isAuthed } = useLoaderData() as LoaderData;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_JSONLD }} />
      <UseCaseScreen
        content={CONTENT}
        isAuthed={isAuthed}
        onCta={() => navigate(isAuthed ? "/home" : "/register")}
        onSignIn={() => navigate("/signin")}
      />
    </>
  );
}
