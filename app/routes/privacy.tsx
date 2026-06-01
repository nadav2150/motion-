import { useNavigate } from "react-router";
import type { Route } from "./+types/privacy";
import { LegalScreen, P, UL, type LegalSection } from "../motionflow/screens/legal";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Privacy Policy — Videly",
    description:
      "How Videly collects, uses, and safeguards your data when you create AI launch and product videos with our motion design tools.",
    path: "/privacy",
  });
}

const LAST_UPDATED = "May 22, 2026";

const SECTIONS: LegalSection[] = [
  {
    heading: "Who we are",
    body: (
      <>
        <P>
          Videly (“Videly”, “we”, “us”) operates the Videly AI platform at videly.io, a web service for
          creating, editing, and rendering cinematic videos using generative-AI models.
        </P>
        <P>
          This Privacy Policy explains what personal information we collect when you use the platform, how
          we use it, and the choices you have. It applies to videly.io, dev.videly.io, and any subdomain
          we control. By using Videly, you agree to the practices described here.
        </P>
      </>
    ),
  },
  {
    heading: "Information you give us",
    body: (
      <>
        <P>When you create an account or use Videly, you provide:</P>
        <UL>
          <li>Account details — name, email address, and a hashed password (or sign-in via Google/GitHub).</li>
          <li>Billing details — handled by our payment processor (Polar). Videly receives a customer ID, subscription tier, transaction status, and last-four card digits, but never your full card number.</li>
          <li>Content you upload or generate — prompts, brand assets, scripts, and the rendered video output. This is stored to power the editor and saved as part of your project history.</li>
          <li>Support communications — anything you send to our support address.</li>
        </UL>
      </>
    ),
  },
  {
    heading: "Information we collect automatically",
    body: (
      <>
        <UL>
          <li>Usage analytics — page views, feature interactions, and product events captured via PostHog. We use these to understand which features work and to fix bugs.</li>
          <li>Device + log data — IP address, browser type, operating system, and timestamps. These are recorded by our infrastructure (Cloudflare, Supabase) to keep the service running and to detect abuse.</li>
          <li>Cookies — session cookies for keeping you signed in, plus a small number of analytics cookies. We do not run advertising trackers.</li>
        </UL>
      </>
    ),
  },
  {
    heading: "How we use your information",
    body: (
      <>
        <UL>
          <li>To provide the service — render your videos, save your projects, sync your settings.</li>
          <li>To bill — process subscriptions and credit packs, send receipts.</li>
          <li>To improve the product — analyse aggregated usage data to fix bugs and prioritise features.</li>
          <li>To communicate — send transactional emails (sign-in, password reset, billing) and, only with your consent, occasional product updates.</li>
          <li>To keep the platform safe — detect abuse, enforce our Terms, and respond to legal requests.</li>
        </UL>
        <P>We do not sell or rent your personal data, and we do not use your content to train third-party foundation models on your behalf.</P>
      </>
    ),
  },
  {
    heading: "AI processing and your content",
    body: (
      <>
        <P>
          When you generate a video, the prompts and assets you submit are sent to AI model providers so they
          can produce the output you asked for. We currently use Anthropic, OpenAI, Replicate, and ElevenLabs.
          Each provider has its own privacy practices, which apply to the request data they receive.
        </P>
        <P>
          To the extent these providers allow, we send prompts via API endpoints that do not contribute your
          content to their public model training. We cannot, however, control how those providers process
          their own logs. Do not submit personal data, secrets, or anything you would not be comfortable
          processing through a third-party API.
        </P>
      </>
    ),
  },
  {
    heading: "Third-party processors",
    body: (
      <>
        <P>Videly relies on a small set of trusted service providers to run the platform:</P>
        <UL>
          <li>Supabase — database, authentication, and file storage.</li>
          <li>Cloudflare — DNS, CDN, and DDoS protection.</li>
          <li>Polar — payment processing and subscription billing.</li>
          <li>PostHog — product analytics.</li>
          <li>Anthropic, OpenAI, Replicate, ElevenLabs — AI model inference.</li>
          <li>Unsplash, Jamendo, Freesound — stock imagery and audio search.</li>
        </UL>
        <P>
          Each of these processors receives only the data necessary to perform its function, under a written
          agreement that limits how they use it.
        </P>
      </>
    ),
  },
  {
    heading: "Your rights and choices",
    body: (
      <>
        <P>You can:</P>
        <UL>
          <li>Access or download the data tied to your account from the Settings page.</li>
          <li>Edit or delete your projects, brand assets, and generated content at any time.</li>
          <li>Close your account by emailing us. We will delete your personal data within 30 days, except where retention is required for billing records, fraud prevention, or applicable law.</li>
          <li>Opt out of non-essential analytics cookies via your browser settings.</li>
          <li>Object to or request a copy of how we process your personal data.</li>
        </UL>
      </>
    ),
  },
  {
    heading: "Data retention",
    body: (
      <P>
        We keep your account data for as long as your account is active. Project content and generated
        renders remain until you delete them. Billing records are kept for up to seven years to satisfy tax
        and accounting requirements. Backups are pruned on a rolling 30-day window.
      </P>
    ),
  },
  {
    heading: "Security",
    body: (
      <P>
        We protect your data with HTTPS in transit, encryption at rest, row-level access controls, and
        principle-of-least-privilege secrets management. No system is perfectly secure — if you discover a
        vulnerability please report it to us at the contact address below before disclosing publicly.
      </P>
    ),
  },
  {
    heading: "Children",
    body: (
      <P>
        Videly is not intended for use by anyone under 16. We do not knowingly collect personal data from
        children. If you believe a child has provided us data, contact us and we will delete it.
      </P>
    ),
  },
  {
    heading: "International transfers",
    body: (
      <P>
        Videly is operated from servers that may be located outside your country of residence. By using the
        service, you consent to your data being transferred and processed in those locations under
        equivalent safeguards.
      </P>
    ),
  },
  {
    heading: "Changes to this policy",
    body: (
      <P>
        We may update this Privacy Policy from time to time. Material changes will be announced inside the
        product and by email to active accounts. The “Last updated” date at the top of this page always
        reflects the current version.
      </P>
    ),
  },
  {
    heading: "Contact",
    body: (
      <P>
        Privacy questions, data requests, or security reports: <a href="mailto:support@videly.io">support@videly.io</a>.
      </P>
    ),
  },
];

export default function PrivacyRoute() {
  const navigate = useNavigate();
  return (
    <LegalScreen
      eyebrow="LEGAL · PRIVACY"
      title="Privacy Policy"
      lede="What we collect, why, and how to control it. Plain language, no dark patterns."
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      altDocTitle="Read the Terms of Service"
      altDocHref="/terms"
      onBack={() => navigate("/")}
    />
  );
}
