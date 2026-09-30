import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/demo-video-agency-alternative";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

// Search Console shows Videly getting impressions (but no rank) for
// "product demo video agency / service / production company". Those
// searchers want someone to make the demo for them; this page answers that
// intent honestly: when an agency is still the right call, and when an AI
// demo video maker is faster and cheaper.
export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Product Demo Video Agency Alternative — AI Demo Videos | Videly",
    description:
      "Skip the product demo video agency. Videly turns your screenshots and a short script into a motion-designed SaaS demo video in minutes, from $0. See when an agency still makes sense.",
    path: "/demo-video-agency-alternative",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "DEMO VIDEO AGENCY ALTERNATIVE",
  headline: "A product demo video agency alternative for SaaS teams that",
  headlineHighlight: "ship every week.",
  subhead:
    "Demo video agencies and production companies make great videos, on their timeline and at their price. Videly is an AI product demo video maker: you bring screenshots and a paragraph, it delivers a motion-designed demo the same day, and you can re-render it every time the UI changes.",
  heroBullets: [
    "Same-day demo, not a 2–6 week production slot",
    "Re-render after every UI change at no extra cost",
    "Start free, paid plans from $19/month",
    "Captions, voice-over and every aspect ratio included",
  ],
  problem: {
    heading: "Agency demos go stale the week you ship.",
    body:
      "A demo video production company works from a brief, a script round, storyboard approval, animation and revisions. That's the right process for a brand film. For a SaaS product that changes every sprint it means paying again, or living with a demo that shows last quarter's UI. Most teams end up with one beautiful video they're afraid to touch.",
  },
  solutions: [
    {
      title: "The agency workflow, compressed",
      description:
        "Videly's director does what a producer does: turns your paragraph into a storyboard (hook, problem, walkthrough, payoff, CTA) that you approve before anything renders.",
    },
    {
      title: "Motion design from your real UI",
      description:
        "Your screenshots become scenes with zooms, focus pulls and transitions, so the demo shows the product you actually ship, not stock footage.",
    },
    {
      title: "Revisions in minutes",
      description:
        "Change a line of script or swap a screenshot and re-render. No change-request emails, no revision caps, no new invoice.",
    },
    {
      title: "Every channel from one project",
      description:
        "Export 16:9 for the landing page, 1:1 and 9:16 for social and app stores, with captions for muted autoplay.",
    },
  ],
  examples: [
    {
      title: "Seed-stage SaaS without a video budget",
      description:
        "Get a landing-page demo before the next launch instead of waiting until you can justify an agency retainer.",
    },
    {
      title: "Product marketing with a weekly release train",
      description:
        "Ship a fresh feature demo with every release note, keeping visuals consistent with your brand kit.",
    },
    {
      title: "Agencies and freelancers themselves",
      description:
        "Use Videly for first drafts and animatics so client review starts from motion, not a static storyboard.",
    },
    {
      title: "Sales teams that need variants",
      description:
        "Spin one demo into shorter cuts per persona or vertical for outbound and sales decks.",
    },
  ],
  faq: [
    {
      q: "When should I still hire a product demo video agency?",
      a: "When you need live-action footage, a custom illustrated world, a big brand film, or someone to own the whole creative strategy. Videly is built for UI-driven demos, launch videos and feature announcements that you want to make and update yourself.",
    },
    {
      q: "How much does a demo video agency cost compared to Videly?",
      a: "Agencies usually price per finished video and quote a production timeline of one to several weeks. Videly starts free (3,100 credits a month) and paid plans start at $19/month, with re-renders included in your credits.",
    },
    {
      q: "Is the result as good as an agency-made demo?",
      a: "For a polished, motion-designed SaaS demo built from your product's UI, Videly gets you most of the way in minutes, and you review the storyboard before it renders. For bespoke character animation or live-action shoots, an agency is still the better choice.",
    },
    {
      q: "Do I need video editing skills?",
      a: "No. You write a paragraph, add screenshots or your product URL, and approve a storyboard. Videly handles scene composition, motion, captions and optional AI voice-over.",
    },
    {
      q: "Can I use Videly for client work?",
      a: "Yes. Paid plans include commercial use and remove the watermark, so freelancers and agencies can use Videly to produce or prototype client demos.",
    },
  ],
  ctaLabel: "Make a demo free",
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

export default function DemoVideoAgencyAlternativeRoute() {
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
