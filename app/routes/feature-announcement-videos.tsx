import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/feature-announcement-videos";
import {
  UseCaseScreen,
  type UseCaseContent,
} from "../motionflow/screens/use-case-screen";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Feature announcement video maker — Videly",
    description:
      "Turn every feature release into a polished announcement video. Videly generates motion-designed feature announcement videos and product update videos for SaaS teams shipping weekly.",
    path: "/feature-announcement-videos",
  });
}

const CONTENT: UseCaseContent = {
  eyebrow: "FEATURE ANNOUNCEMENTS · WEEKLY MOTION",
  headline: "A motion-designed feature announcement video for",
  headlineHighlight: "every release.",
  subhead:
    "Most product updates ship as a screenshot and a paragraph. Videly turns each release into a 15–30 second feature announcement video that actually gets watched, shared, and remembered — generated from the same artifacts you already produce for your changelog.",
  heroBullets: [
    "Generate a feature video from release notes in minutes",
    "Reuse one brand kit across every release",
    "Built for weekly cadence — not one-off launches",
    "Crop presets for X, LinkedIn, in-app banners",
  ],
  problem: {
    heading: "Your changelog deserves to move.",
    body:
      "Real product update videos move users to upgrade, reactivate, and share. But making one per release is the kind of work that gets cut first: a designer's day per feature, multiplied by 20 features a quarter, is a full-time hire. Videly was built so a single founder or PM can keep up — feature ships, video ships, in the same hour.",
  },
  solutions: [
    {
      title: "Release-notes-first workflow",
      description:
        "Paste your release-notes paragraph or markdown bullet list. Videly turns the highlights into individual scenes with the right pacing and emphasis.",
    },
    {
      title: "Reusable brand kit",
      description:
        "Set brand colours, logo, and typography once. Every weekly release re-uses the same identity automatically — no copy-paste between projects.",
    },
    {
      title: "Pre-tuned for short-form",
      description:
        "Default templates are 15–30 seconds — the length that actually performs on X, LinkedIn, and in-app banners. No more 90-second corporate-style videos no one watches.",
    },
    {
      title: "Render at scale",
      description:
        "Multiple concurrent renders so your design team isn't the bottleneck on Tuesday's product update push.",
    },
  ],
  examples: [
    {
      title: "Weekly product update on X",
      description:
        "20-second video summarising what shipped this week, posted every Friday with the release-notes link.",
    },
    {
      title: "In-app announcement banner",
      description:
        "Embed a short feature announcement video inside the changelog modal so users actually understand what's new.",
    },
    {
      title: "Email campaign loop",
      description:
        "A 6-second silent loop as the hero image of the release email — drives 2–3× the click-through of a static screenshot.",
    },
    {
      title: "Sales enablement",
      description:
        "Every new feature gets a 30-second video your sales team can drop into outbound and demo recaps.",
    },
  ],
  faq: [
    {
      q: "What's the difference between a launch video and a feature announcement video?",
      a: "A launch video is the big-bang reveal — 30–60 seconds, scripted, premium. A feature announcement video is a smaller, faster cadence — 15–30 seconds, one feature, shipped weekly. Videly handles both, but the feature-announcement template is tuned for speed.",
    },
    {
      q: "Can I batch multiple features into one video?",
      a: "Yes. Paste a list of release-notes bullets and Videly assigns one scene per bullet. Recommended for monthly recap videos; for weekly drops, one scene per video tends to perform better.",
    },
    {
      q: "Do I need to write a script or just bullets?",
      a: "Bullets are enough. The director will fill in scene transitions and on-screen captions. You can paste a script if you want more control over phrasing.",
    },
    {
      q: "Where do these videos perform best?",
      a: "Short-form: X, LinkedIn, in-app banners, release-email hero, Discord/Slack changelog channels. Less effective on YouTube where longer-form wins.",
    },
    {
      q: "How many feature videos can I make per month?",
      a: "Depends on plan. Starter ($19/mo) covers about 4–6 short feature videos a month. Pro ($49/mo) covers 12–18. Studio ($149/mo) covers 50+ — sized for teams shipping daily.",
    },
    {
      q: "Can I edit a scene after Videly generates it?",
      a: "Yes. Every scene is editable in the timeline — swap screenshots, tweak captions, change the easing preset. The AI gives you a strong starting point, not a locked output.",
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

export default function FeatureAnnouncementVideosRoute() {
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
