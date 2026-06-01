import { useNavigate } from "react-router";
import type { Route } from "./+types/refund";
import { LegalScreen, P, UL, type LegalSection } from "../motionflow/screens/legal";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Refund Policy — Videly",
    description:
      "Videly's refund policy: when subscriptions and credit packs are refundable, how to request a refund, and how Polar processes them.",
    path: "/refund",
  });
}

const LAST_UPDATED = "May 24, 2026";

const SECTIONS: LegalSection[] = [
  {
    heading: "Summary",
    body: (
      <>
        <P>
          We want Videly to be worth the price. If it isn't a fit, you can request a refund on a recent
          subscription charge within 14 days of the payment, subject to the conditions below. Credit packs
          are refundable only when unused. All refunds are issued through our payment processor, Polar,
          back to the original payment method.
        </P>
      </>
    ),
  },
  {
    heading: "Subscriptions (Starter, Pro, Studio)",
    body: (
      <>
        <P>
          You can request a refund of a subscription charge within <strong>14 days</strong> of the date the
          charge appears on your statement, provided that:
        </P>
        <UL>
          <li>You have not consumed more than 25% of the monthly credit grant included in that billing period; and</li>
          <li>The charge being refunded is the most recent subscription invoice (we do not retro-refund
            historical invoices once the next billing cycle has begun).</li>
        </UL>
        <P>
          When a subscription refund is issued, your account is downgraded to the Free tier immediately and
          any remaining credits from the refunded period are removed.
        </P>
      </>
    ),
  },
  {
    heading: "Cancellations",
    body: (
      <>
        <P>
          You can cancel a subscription at any time from <a href="/settings">Settings → Billing</a>.
          Cancellation stops future renewals; it does <em>not</em> refund the current billing period. Your
          paid features remain active until the end of the period you've already paid for, at which point
          the account drops to the Free tier.
        </P>
      </>
    ),
  },
  {
    heading: "Credit packs",
    body: (
      <>
        <P>
          Credit packs (one-off top-ups bought in addition to a subscription) are refundable only if no
          credits from that pack have been used. Once any portion of the pack is consumed by a render,
          critique, polish, or other paid operation, the pack is non-refundable because the underlying AI
          compute cost has already been incurred on your behalf.
        </P>
      </>
    ),
  },
  {
    heading: "Exclusions",
    body: (
      <>
        <P>The following situations are not eligible for a refund:</P>
        <UL>
          <li>Dissatisfaction with the creative output of a successfully rendered video. AI generation is
            inherently variable; we recommend trying the Free tier first to evaluate quality.</li>
          <li>Subscription charges older than 14 days, or any charge after the next billing cycle has
            started.</li>
          <li>Credit packs that have been partially or fully consumed.</li>
          <li>Charges resulting from a successful subscription renewal where the cancel button was available
            and not used before the renewal date. Set a reminder, or cancel as soon as you decide not to
            continue.</li>
          <li>Accounts terminated for violation of the <a href="/terms">Terms of Service</a>.</li>
        </UL>
      </>
    ),
  },
  {
    heading: "How to request a refund",
    body: (
      <>
        <P>
          Email <a href="mailto:support@videly.io">support@videly.io</a> from the email address on your
          Videly account. Include:
        </P>
        <UL>
          <li>The date and amount of the charge.</li>
          <li>The last four digits of the card used (or the Polar order id if available).</li>
          <li>A short note on why you're requesting the refund — this helps us improve the product but does
            not affect eligibility.</li>
        </UL>
        <P>
          We respond within 2 business days. Approved refunds are submitted to Polar the same day and
          typically appear back on your card within 5–10 business days, depending on your bank.
        </P>
      </>
    ),
  },
  {
    heading: "Chargebacks",
    body: (
      <>
        <P>
          Please contact us before disputing a charge with your bank. Chargebacks incur a fee charged by
          our payment processor and may result in immediate account suspension while the dispute is
          investigated. We will work in good faith to resolve any billing issue directly.
        </P>
      </>
    ),
  },
  {
    heading: "Payment processor",
    body: (
      <>
        <P>
          Videly uses <a href="https://polar.sh" target="_blank" rel="noopener noreferrer">Polar</a> as
          the merchant of record for all transactions. All charges, refunds, taxes, and invoices are
          processed by Polar on our behalf. Polar's own
          <a href="https://polar.sh/legal/terms" target="_blank" rel="noopener noreferrer"> terms</a> may
          apply in addition to this one.
        </P>
      </>
    ),
  },
  {
    heading: "Statutory rights",
    body: (
      <>
        <P>
          Where local consumer law (for example the EU Consumer Rights Directive's 14-day withdrawal right
          for digital services) grants you stronger refund rights than this policy, those statutory rights
          apply. Nothing in this policy limits any non-waivable consumer protection you may have under the
          law of your country of residence.
        </P>
      </>
    ),
  },
  {
    heading: "Changes to this policy",
    body: (
      <P>
        We may update this Refund Policy from time to time. Material changes will be announced inside the
        product. The "Last updated" date at the top of this page always reflects the current version.
        Changes apply to charges made after the update date — they are not retroactive.
      </P>
    ),
  },
  {
    heading: "Contact",
    body: (
      <P>
        Refund requests and billing questions: <a href="mailto:support@videly.io">support@videly.io</a>.
      </P>
    ),
  },
];

export default function RefundRoute() {
  const navigate = useNavigate();
  return (
    <LegalScreen
      eyebrow="LEGAL · REFUND POLICY"
      title="Refund Policy"
      lede="When subscriptions and credit packs are refundable, and how to request a refund through Polar."
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      altDocTitle="Read the Terms of Service"
      altDocHref="/terms"
      onBack={() => navigate("/")}
    />
  );
}
