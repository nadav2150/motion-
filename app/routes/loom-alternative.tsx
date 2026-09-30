import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/loom-alternative";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

// "loom alternative" is ~1,000 US searches/month at keyword difficulty 0
// (DataForSEO, Sep 2026). /vs/loom is a one-on-one comparison; this page
// answers the list-shaped query. Keep competitor descriptions factual.
export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Best Loom Alternatives for Product & Demo Videos | Videly",
    description:
      "Looking for a Loom alternative? Compare Videly, Tella, Screen Studio, Descript, Vidyard and interactive-demo tools, and pick the right one for demos, launches or async updates.",
    path: "/loom-alternative",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "LOOM ALTERNATIVE",
  headline: "The Loom alternative for product videos that need to",
  headlineHighlight: "look designed.",
  subhead:
    "Loom is the fastest way to record your screen and send a link. When the video is going on your landing page, in a launch post or in a sales sequence, a raw recording undersells the product. Videly turns screenshots and a short script into a motion-designed product video instead.",
  heroBullets: [
    "Motion design, not a webcam bubble",
    "Brand colours and logo applied to every scene",
    "Captions and optional AI voice-over",
    "Start free, paid plans from $19/month",
  ],
  problem: {
    heading: "Why teams look for a Loom alternative.",
    body:
      "Loom is built for quick, async communication: record, share, get reactions. It isn't built for polish. Recordings show every hesitation and every loading spinner, there are no scenes or motion graphics, and updating the video after a UI change means recording it again. For public-facing product videos, most teams need a different kind of tool.",
  },
  solutions: [
    {
      title: "Script in, storyboard out",
      description:
        "Write what the video should say. Videly plans the scenes (hook, problem, walkthrough, payoff, CTA) and shows you the storyboard before rendering.",
    },
    {
      title: "Your UI, animated",
      description:
        "Screenshots or your product URL become scenes with zooms, focus pulls and transitions, so the product looks as good as it works.",
    },
    {
      title: "No re-recording",
      description:
        "Changed the UI or the pitch? Swap a screenshot or a line of script and re-render. No second take.",
    },
    {
      title: "Every format",
      description:
        "Export 16:9, 1:1 and 9:16 for your site, X, LinkedIn, Product Hunt and app stores.",
    },
  ],
  examples: [
    {
      title: "Landing-page hero video",
      description: "A silent, captioned loop that explains the product above the fold.",
    },
    {
      title: "Launch and feature announcements",
      description: "A designed video for every release instead of a quick screen grab.",
    },
    {
      title: "Sales outreach",
      description: "A short product video your reps can reuse, rather than recording one per prospect.",
    },
    {
      title: "Keep Loom for the rest",
      description: "Many teams use Loom for internal updates and Videly for anything customers see.",
    },
  ],
  alternatives: {
    heading: "The best Loom alternatives, by job.",
    intro:
      "There is no single replacement for Loom, because people use it for different jobs. Pick by what the video is for.",
    items: [
      {
        name: "Videly",
        bestFor: "designed product, launch and demo videos",
        description:
          "Generates a motion-designed video from screenshots and a script, with brand kit, captions and voice-over. Not a screen recorder: use it when the video is public-facing.",
      },
      {
        name: "Tella",
        bestFor: "polished screen recordings",
        description:
          "Browser-based screen and camera recording with layouts, backgrounds and easy trimming. A step up in polish from a plain recording.",
      },
      {
        name: "Screen Studio",
        bestFor: "Mac screen recordings with automatic zoom",
        description:
          "macOS screen recorder that adds automatic zoom-ins and smooth cursor movement to recordings.",
      },
      {
        name: "Descript",
        bestFor: "editing recordings like a document",
        description:
          "Record your screen and edit the video by editing its transcript. Good for tutorials and longer walkthroughs.",
      },
      {
        name: "Vidyard",
        bestFor: "sales video messaging",
        description:
          "Video recording, hosting and viewer analytics aimed at sales teams sending personalised videos.",
      },
      {
        name: "Arcade or Supademo",
        bestFor: "interactive click-through demos",
        description:
          "Instead of a video, build a clickable product tour that prospects step through at their own pace.",
      },
    ],
  },
  faq: [
    {
      q: "What is the best free Loom alternative?",
      a: "It depends on the job. For designed product videos, Videly has a free plan with 3,100 credits a month. For plain screen recording, most recorders in this list have a free tier or trial.",
    },
    {
      q: "Is Videly a screen recorder?",
      a: "No. Videly doesn't record your screen. It builds a motion-designed video from screenshots (or your product URL) and a short script. If you need a quick recorded walkthrough, keep using a screen recorder.",
    },
    {
      q: "Can I replace Loom product demos with Videly?",
      a: "For demos that go on your website, in launch posts or in outbound sequences, yes. For one-off async answers to a teammate or customer, a screen recording is still faster.",
    },
    {
      q: "Does Videly add captions and voice-over?",
      a: "Yes. Captions are generated automatically, and you can add an AI voice-over from your script or upload your own audio.",
    },
    {
      q: "How is this different from the Videly vs Loom page?",
      a: "The Videly vs Loom page compares the two tools feature by feature. This page covers the wider set of Loom alternatives so you can pick the right tool for each job.",
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

export default function LoomAlternativeRoute() {
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
