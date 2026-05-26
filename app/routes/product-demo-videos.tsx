import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/product-demo-videos";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "AI product demo video maker for SaaS — Videly",
    description:
      "Generate a polished product demo video from screenshots and a short script. Videly is the AI product demo video maker built for SaaS founders, PMs, and growth teams.",
    path: "/product-demo-videos",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "PRODUCT DEMOS · AI VIDEO GENERATOR",
  headline: "A product demo video that doesn't look like a",
  headlineHighlight: "screen recording.",
  subhead:
    "Videly is the AI product demo video maker for SaaS teams who want a real demo — motion design, scene composition, voice-over — without booking a video agency. Drop in screenshots, write a paragraph, get a demo your sales team will actually use.",
  heroBullets: [
    "From screenshot to demo video in minutes",
    "Optional AI voiceover or your own audio",
    "Built-in captions for muted social autoplay",
    "Export-ready for landing page, X, App Store, App Store Connect",
  ],
  problem: {
    heading: "Screen recordings don't sell the product.",
    body:
      "A raw screen recording shows what the product does but never explains why anyone should care. A real product demo video frames the problem, walks through the solution, and ends on a clear CTA — that's the difference between a 12% landing page conversion and a 4% one. Building one used to mean hiring a video producer; Videly makes it a 10-minute task.",
  },
  solutions: [
    {
      title: "Script-driven scene plan",
      description:
        "Write a 1-paragraph script of the problem and solution. Videly's director breaks it into demo scenes — hook, problem, walkthrough, payoff, CTA.",
    },
    {
      title: "Screenshots → product motion",
      description:
        "Your screenshots get composited into demo scenes with parallax, focus pulls, and zoom-into-detail moves — the kind of motion design that makes a SaaS UI feel alive.",
    },
    {
      title: "Voice-over without a recording booth",
      description:
        "Optional AI voice-over generated from your script, or upload your own VO. Captions auto-generated either way for the 85% of social autoplay that runs muted.",
    },
    {
      title: "One project, every surface",
      description:
        "Render once and export the right aspect ratio for your landing page hero, X demo thread, App Store preview, and outbound sales emails.",
    },
  ],
  examples: [
    {
      title: "Landing-page hero demo",
      description:
        "30-second silent autoplay loop above the fold that explains the product without forcing a sound-on watch.",
    },
    {
      title: "Sales outbound deck",
      description:
        "60-second narrated demo your AEs drop into cold emails. Higher reply rates than a Loom screen-share for first touches.",
    },
    {
      title: "App Store preview video",
      description:
        "Vertical 9:16 demo with captions, sized to the App Store / Play Store preview spec.",
    },
    {
      title: "PMM walkthrough for analysts",
      description:
        "5-minute deep-dive video for analyst briefings — same script, longer scenes, technical voice-over.",
    },
  ],
  faq: [
    {
      q: "How is this different from a Loom screen recording?",
      a: "Loom is great for ad-hoc internal videos: hit record, talk, send link. Videly is for the demos that go on your landing page, App Store, or in your sales sequence — where motion design and pacing matter and a raw recording undersells the product.",
    },
    {
      q: "Can I use my own voice instead of AI voice-over?",
      a: "Yes. Upload an audio file and Videly will sync it to scene timing. Skip voice-over entirely if you prefer caption-driven silent demos — those tend to perform best on social.",
    },
    {
      q: "How long can a product demo video be?",
      a: "Free tier caps at ~2 scenes (about 12 seconds). Paid plans go up to 14 scenes (~90 seconds), which covers most demo lengths from short loops to full walkthroughs.",
    },
    {
      q: "Do I need to upload all my screenshots, or can I link to a live URL?",
      a: "Both work. Upload screenshots directly, or paste your product URL and Videly's scraper pulls the brand assets and the rendered page. Direct upload is faster and gives you more control.",
    },
    {
      q: "Will the AI hallucinate features I don't have?",
      a: "No — the renderer composes from the screenshots you provide. The director's script-to-scene mapping is grounded in what you wrote, so it won't invent flows. You're always shown the storyboard before render.",
    },
    {
      q: "Can I update the demo after I ship a UI change?",
      a: "Yes. Swap the affected screenshots in the project and re-render. The motion design stays the same; only the source screenshots change. Much faster than re-shooting a real demo.",
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

export default function ProductDemoVideosRoute() {
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
