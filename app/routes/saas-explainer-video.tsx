import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/saas-explainer-video";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

// "saas explainer" + "saas explainer video" are ~310 US searches/month at
// keyword difficulty 0; "explainer video maker" is 390 at KD 24
// (DataForSEO, Sep 2026).
export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "SaaS Explainer Video Maker — AI Explainer Videos | Videly",
    description:
      "Make a SaaS explainer video with AI. Videly turns your screenshots and a short script into an animated explainer video with captions and voice-over in minutes. Start free.",
    path: "/saas-explainer-video",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "SAAS EXPLAINER VIDEO MAKER",
  headline: "Make a SaaS explainer video that explains your",
  headlineHighlight: "actual product.",
  subhead:
    "Videly is an AI explainer video maker built for SaaS. Instead of stock characters and generic animation, it builds the explainer from your own screenshots and script, so visitors see what the product does in under a minute.",
  heroBullets: [
    "Explainer video from a paragraph of script",
    "Your real UI, animated scene by scene",
    "Captions and optional AI voice-over",
    "Start free, paid plans from $19/month",
  ],
  problem: {
    heading: "Most SaaS explainer videos explain nothing.",
    body:
      "The classic explainer is a character with a problem, a lightbulb moment and a logo at the end. It is expensive to produce, takes weeks, and rarely shows the product. When the UI changes it is out of date. A SaaS explainer should show the product solving the problem, and it should be cheap enough to update.",
  },
  solutions: [
    {
      title: "Problem, solution, call to action",
      description:
        "Write the pitch in a paragraph. Videly structures it into explainer scenes: the problem, how your product solves it, and a clear call to action.",
    },
    {
      title: "Animated from your screenshots",
      description:
        "Your UI becomes the visuals, with zooms, highlights and transitions that walk viewers through the key flow.",
    },
    {
      title: "Voice-over and captions",
      description:
        "Add an AI voice-over generated from the script or upload your own. Captions are automatic for muted autoplay.",
    },
    {
      title: "Update in minutes",
      description:
        "Swap a screenshot or edit a line and re-render. Your explainer stays current with the product.",
    },
  ],
  examples: [
    {
      title: "Homepage explainer",
      description: "A 30–60 second video that tells first-time visitors what the product does.",
    },
    {
      title: "Onboarding welcome video",
      description: "Explain the core workflow to new sign-ups before they start.",
    },
    {
      title: "Investor and partner decks",
      description: "A short explainer to open a pitch or partnership conversation.",
    },
    {
      title: "Paid social",
      description: "Vertical and square cuts of the same explainer for ads.",
    },
  ],
  faq: [
    {
      q: "How long should a SaaS explainer video be?",
      a: "Usually 30 to 90 seconds. Long enough to show the problem, the product solving it and a call to action, and short enough that visitors watch to the end.",
    },
    {
      q: "How do I make an explainer video with AI?",
      a: "With Videly, write a paragraph about the problem and your solution, add screenshots or your product URL, approve the storyboard and render. You get an MP4 with motion design, captions and optional voice-over.",
    },
    {
      q: "Is Videly an animated explainer video maker?",
      a: "Yes, but it animates your product interface rather than cartoon characters. For character-driven animation, an animation studio or a character-animation tool is a better fit.",
    },
    {
      q: "How much does a SaaS explainer video cost?",
      a: "Studios usually quote per video with a multi-week timeline. Videly starts free (3,100 credits a month) and paid plans start at $19/month, with re-renders included in your credits.",
    },
    {
      q: "Can I use my own voice-over?",
      a: "Yes. Upload an audio file and Videly syncs it to the scenes, or generate an AI voice-over from your script.",
    },
  ],
  ctaLabel: "Make an explainer free",
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

export default function SaasExplainerVideoRoute() {
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
