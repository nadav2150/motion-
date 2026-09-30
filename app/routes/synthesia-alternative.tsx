import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/synthesia-alternative";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

// "synthesia alternative" is ~210 US searches/month at keyword difficulty 0
// (DataForSEO, Sep 2026). /vs/synthesia is the one-on-one comparison; this
// page answers the list-shaped query. Keep competitor descriptions factual.
export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Synthesia Alternatives: AI Video Without Avatars | Videly",
    description:
      "Comparing Synthesia alternatives? See Videly, HeyGen, Colossyan, D-ID and Elai, and when a motion-designed product video beats an AI avatar presenter for SaaS.",
    path: "/synthesia-alternative",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "SYNTHESIA ALTERNATIVE",
  headline: "A Synthesia alternative for product videos that show the",
  headlineHighlight: "product, not an avatar.",
  subhead:
    "Synthesia is built around AI presenters: a digital human reads your script. For SaaS launches, demos and feature announcements, viewers want to see the product itself. Videly turns your screenshots and script into a motion-designed product video, no avatar required.",
  heroBullets: [
    "Your UI is the star of every scene",
    "Brand kit, captions and optional AI voice-over",
    "Storyboard preview before you render",
    "Start free, paid plans from $19/month",
  ],
  problem: {
    heading: "Why SaaS teams look for a Synthesia alternative.",
    body:
      "Avatar videos work well for training, onboarding and localised talking-head content. For product marketing they have a catch: a presenter takes up the frame your product should fill, and audiences increasingly recognise AI avatars. If your goal is to make the product look good, you need a tool built around the product.",
  },
  solutions: [
    {
      title: "Product-first scenes",
      description:
        "Screenshots or your product URL become animated scenes with zooms, focus pulls and transitions.",
    },
    {
      title: "Script-driven storyboard",
      description:
        "Write a paragraph; Videly plans the scenes and shows the storyboard for approval before rendering.",
    },
    {
      title: "Voice without a face",
      description:
        "Optional AI voice-over from your script, or upload your own audio. Captions are generated automatically.",
    },
    {
      title: "Ready for every channel",
      description:
        "Export 16:9, 1:1 and 9:16 for your site, social posts, Product Hunt and app stores.",
    },
  ],
  examples: [
    {
      title: "Launch videos",
      description: "Announce a new product or major release with a designed video.",
    },
    {
      title: "Feature announcements",
      description: "A short video for every release note, consistent with your brand.",
    },
    {
      title: "Product demos",
      description: "A landing-page or sales demo built from your real UI.",
    },
    {
      title: "Keep avatars where they fit",
      description: "Training and multilingual talking-head content can stay on an avatar platform.",
    },
  ],
  alternatives: {
    heading: "The best Synthesia alternatives.",
    intro:
      "Most Synthesia alternatives are other avatar platforms. Videly is the option for teams that want the product, not a presenter, on screen.",
    items: [
      {
        name: "Videly",
        bestFor: "SaaS product, launch and demo videos",
        description:
          "Motion-designed videos generated from screenshots and a script, with brand kit, captions and optional voice-over. No avatars.",
      },
      {
        name: "HeyGen",
        bestFor: "AI avatars and video translation",
        description:
          "AI avatar videos, custom avatars of yourself and translated videos with lip-sync.",
      },
      {
        name: "Colossyan",
        bestFor: "workplace training videos",
        description:
          "AI presenter videos aimed at learning and development teams, with scenario-style training content.",
      },
      {
        name: "D-ID",
        bestFor: "talking heads from a photo",
        description:
          "Animates a still photo into a talking-head video, with an API for developers.",
      },
      {
        name: "Elai.io",
        bestFor: "turning text or slides into presenter videos",
        description:
          "Creates AI presenter videos from text, articles or presentations.",
      },
    ],
  },
  faq: [
    {
      q: "Is there a Synthesia alternative without avatars?",
      a: "Yes. Videly makes product videos with no presenter at all: your UI is animated into scenes, with captions and optional AI voice-over.",
    },
    {
      q: "Which Synthesia alternative is best for SaaS marketing?",
      a: "For launch, demo and feature videos, a product-first tool like Videly usually fits better than an avatar platform, because the product fills the frame. For training or multilingual talking-head content, an avatar tool is the better match.",
    },
    {
      q: "Is there a free Synthesia alternative?",
      a: "Videly has a free plan with 3,100 credits a month. Most avatar platforms offer a free trial or a limited free tier.",
    },
    {
      q: "Can Videly add a voice-over like Synthesia?",
      a: "Yes. Videly can generate an AI voice-over from your script, or you can upload your own recording. There is just no on-screen avatar.",
    },
    {
      q: "Where can I see a direct comparison?",
      a: "The Videly vs Synthesia page compares the two tools feature by feature.",
    },
  ],
  ctaLabel: "Try Videly free",
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

export default function SynthesiaAlternativeRoute() {
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
