import { useNavigate } from "react-router";
import type { Route } from "./+types/terms";
import { LegalScreen, P, UL, type LegalSection } from "../motionflow/screens/legal";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Terms of Service — Videly",
    description:
      "The terms that govern your use of the Videly platform, billing, and AI-generated launch and product videos.",
    path: "/terms",
  });
}

const LAST_UPDATED = "May 22, 2026";

const SECTIONS: LegalSection[] = [
  {
    heading: "Acceptance",
    body: (
      <>
        <P>
          These Terms of Service (“Terms”) are a legal agreement between you and Videly (“Videly”, “we”,
          “us”) for the Videly AI platform at videly.io and any related subdomain or product. By creating
          an account or otherwise using the service, you confirm that you have read these Terms and agree
          to be bound by them.
        </P>
        <P>If you are using Videly on behalf of an organisation, you confirm that you have authority to bind that organisation to these Terms.</P>
      </>
    ),
  },
  {
    heading: "Your account",
    body: (
      <>
        <UL>
          <li>You must be at least 16 years old (or the age of digital consent in your country, whichever is higher) to use Videly.</li>
          <li>You are responsible for safeguarding your password and for any activity under your account. Notify us at <a href="mailto:support@videly.io">support@videly.io</a> if you suspect unauthorised access.</li>
          <li>Accurate information is required at signup. Impersonating another person or entity is grounds for termination.</li>
          <li>One account per individual. Sharing credentials is not permitted on individual plans.</li>
        </UL>
      </>
    ),
  },
  {
    heading: "The service",
    body: (
      <P>
        Videly is a software platform that lets you generate, edit, and render videos using third-party AI
        models. The features available to you depend on the plan tier you have purchased and any add-on
        credit packs on your account. We may add, change, or remove features at any time; material removals
        will be announced in advance.
      </P>
    ),
  },
  {
    heading: "Subscriptions, credits, and billing",
    body: (
      <>
        <UL>
          <li>Paid plans are billed monthly through Paddle, our merchant of record. Each renewal grants a fresh credit allowance for that billing period.</li>
          <li>Unused monthly credits do not roll over. Add-on credit packs do not expire while your account is active.</li>
          <li>Prices may change for future billing periods on at least 30 days’ notice; your current period is honoured at the price you agreed to.</li>
          <li>Taxes are calculated and collected by Paddle based on your billing address.</li>
        </UL>
      </>
    ),
  },
  {
    heading: "Refunds",
    body: (
      <P>
        We offer a 14-day refund window for new subscriptions where no significant usage of credits has
        occurred. Credit packs are non-refundable once any credits from the pack have been spent. Refund
        requests are handled case-by-case at <a href="mailto:support@videly.io">support@videly.io</a>.
      </P>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <>
        <P>You agree not to use Videly to:</P>
        <UL>
          <li>Produce content depicting minors in sexual situations, non-consensual sexual content, or graphic violence intended to harm.</li>
          <li>Impersonate a real person without consent, including by cloning their voice or likeness.</li>
          <li>Infringe anyone’s intellectual property, publicity, or privacy rights.</li>
          <li>Generate material designed to defraud, harass, or threaten others.</li>
          <li>Reverse engineer the platform, scrape it at scale, or evade rate limits or usage caps.</li>
          <li>Resell access to Videly without a written agreement with us.</li>
        </UL>
        <P>We may suspend or terminate accounts that violate these rules, with or without notice depending on severity.</P>
      </>
    ),
  },
  {
    heading: "Content you create",
    body: (
      <>
        <P>
          You retain ownership of the prompts, assets, and final renders you create through Videly, subject
          to the rights of any third parties whose content you incorporate. You grant Videly a non-exclusive,
          worldwide licence to host, process, and deliver your content as needed to operate the service.
        </P>
        <P>
          Output produced by AI models is provided “as is”. Generative models can produce content that
          resembles existing work, makes factual errors, or is otherwise unsuitable for your purpose. You
          are responsible for reviewing each render before public use.
        </P>
      </>
    ),
  },
  {
    heading: "Third-party services",
    body: (
      <P>
        Videly integrates with third-party providers, including Anthropic, OpenAI, Replicate, ElevenLabs,
        Unsplash, Jamendo, and Freesound. Your use of features that rely on those providers is also subject
        to their respective terms. We are not responsible for the practices of providers we do not control.
      </P>
    ),
  },
  {
    heading: "Termination",
    body: (
      <>
        <P>You can cancel your account at any time from the Settings page or by emailing support.</P>
        <P>
          We may suspend or close your account if you breach these Terms, if your payment fails after
          reasonable retries, or if your activity poses a security or legal risk to Videly or our other
          users. Pro-rated refunds, if any, will be issued at our discretion.
        </P>
      </>
    ),
  },
  {
    heading: "Disclaimers",
    body: (
      <P>
        Videly is provided on an “as is” and “as available” basis. To the maximum extent permitted by law,
        we disclaim all warranties, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the service will be uninterrupted, error-free, or produce
        any particular result.
      </P>
    ),
  },
  {
    heading: "Limitation of liability",
    body: (
      <P>
        To the maximum extent permitted by law, Videly’s aggregate liability for any claim arising out of
        or related to the service will not exceed the amount you paid us for the service in the twelve
        months preceding the claim. We are not liable for indirect, incidental, consequential, or punitive
        damages, including loss of profits, data, or goodwill.
      </P>
    ),
  },
  {
    heading: "Indemnity",
    body: (
      <P>
        You agree to defend and indemnify Videly against claims arising from your content, your use of the
        service in violation of these Terms, or your violation of the rights of a third party.
      </P>
    ),
  },
  {
    heading: "Changes to the service or these Terms",
    body: (
      <P>
        We may update these Terms from time to time. If a change is material, we will notify active accounts
        by email and inside the product. Continuing to use Videly after the new Terms take effect means you
        accept them. If you do not agree, you may close your account before the effective date.
      </P>
    ),
  },
  {
    heading: "Governing terms",
    body: (
      <P>
        Any dispute that cannot be resolved informally will be handled under the laws of the jurisdiction
        in which Videly operates, with venue in the courts located there. Nothing in these Terms limits
        your statutory rights as a consumer.
      </P>
    ),
  },
  {
    heading: "Contact",
    body: (
      <P>
        Questions about these Terms or your account: <a href="mailto:support@videly.io">support@videly.io</a>.
      </P>
    ),
  },
];

export default function TermsRoute() {
  const navigate = useNavigate();
  return (
    <LegalScreen
      eyebrow="LEGAL · TERMS"
      title="Terms of Service"
      lede="The rules of the road for using Videly — what we offer, what we expect, and what we’re responsible for."
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      altDocTitle="Read the Privacy Policy"
      altDocHref="/privacy"
      onBack={() => navigate("/")}
    />
  );
}
