// Which payment provider runs checkout, cancellation and the billing gate.
// BILLING_PROVIDER=dodo switches to Dodo Payments; anything else keeps Polar,
// so existing deploys behave exactly as before until the flag is flipped.
// Both webhook routes stay mounted either way, so subscriptions that already
// live in the old provider keep renewing and granting credits.

import { isDodoConfigured } from "./dodo";
import { isPolarConfigured } from "./polar";

export type BillingProvider = "polar" | "dodo";

export function billingProvider(): BillingProvider {
  return (process.env.BILLING_PROVIDER ?? "").toLowerCase() === "dodo" ? "dodo" : "polar";
}

export function isProviderConfigured(): boolean {
  return billingProvider() === "dodo" ? isDodoConfigured() : isPolarConfigured();
}
