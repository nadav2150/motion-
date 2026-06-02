// POST /api/billing/checkout — creates a Polar checkout session for the signed
// in user and returns its hosted URL. We pass externalCustomerId = our Supabase
// user.id so Polar auto-creates/links the customer (no pre-mint step) and
// metadata carries userId/planTier/packKey for the webhook handler.

import type { Route } from "./+types/api.billing.checkout";
import { requireUserApi } from "../lib/auth";
import {
  getPolar,
  isPolarConfigured,
  productEnvVarName,
  productIdForPack,
  productIdForTier,
} from "../lib/billing/polar";

const POLAR_ENV = (process.env.POLAR_ENV ?? "sandbox").toLowerCase();
// Surface the real failure reason to the client only outside production, so we
// don't leak internals from videly.io while keeping sandbox/dev debuggable.
const EXPOSE_ERRORS = POLAR_ENV !== "production";

type Body = { tier?: string; pack?: string | null };

function isTier(v: unknown): v is "starter" | "pro" | "studio" {
  return v === "starter" || v === "pro" || v === "studio";
}
function isPack(v: unknown): v is "small" | "medium" | "large" {
  return v === "small" || v === "medium" || v === "large";
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);

  const body = (await request.json().catch(() => ({}))) as Body;
  const tier = body.tier;
  if (!isTier(tier)) {
    return Response.json({ error: `Invalid tier "${tier}"` }, { status: 400, headers });
  }

  // Fail fast with a precise message when the access token isn't wired. This is
  // the #1 cause of a "checkout failed" 502 — a deploy/env where POLAR_ENV
  // points at a set of secrets that were never populated.
  if (!isPolarConfigured()) {
    const missing = productEnvVarName("ACCESS_TOKEN");
    console.error(`[checkout] Polar not configured: ${missing} is empty (POLAR_ENV=${POLAR_ENV})`);
    return Response.json(
      { error: "Billing is not configured", ...(EXPOSE_ERRORS ? { detail: `${missing} is not set (POLAR_ENV=${POLAR_ENV})` } : {}) },
      { status: 500, headers },
    );
  }

  const tierProduct = productIdForTier(tier);
  if (!tierProduct) {
    return Response.json(
      { error: `No Polar product configured for tier "${tier}". Set ${productEnvVarName(`PRODUCT_${tier.toUpperCase()}`)}.` },
      { status: 500, headers },
    );
  }

  const products: string[] = [tierProduct];
  const pack = body.pack;
  if (isPack(pack)) {
    const packProduct = productIdForPack(pack);
    if (packProduct) products.push(packProduct);
    else console.warn(`[checkout] no Polar product for pack "${pack}" — continuing subscription only`);
  }

  const origin = new URL(request.url).origin;

  // Polar rejects empty-string metadata values (each value must be a non-empty
  // string or a number/bool). Only attach packKey when a pack was chosen —
  // sending packKey:"" fails validation on plan-only checkouts.
  const metadata: Record<string, string> = { userId: user.id, planTier: tier };
  if (isPack(pack)) metadata.packKey = pack;

  console.log(
    `[checkout] creating session user=${user.id} tier=${tier} pack=${isPack(pack) ? pack : "none"} ` +
      `env=${POLAR_ENV} products=${products.join(",")}`,
  );

  try {
    const checkout = await getPolar().checkouts.create({
      products,
      externalCustomerId: user.id,
      metadata,
      successUrl: `${origin}/home?upgraded=${tier}`,
    });
    console.log(`[checkout] session created user=${user.id} checkout_id=${checkout.id} url=${checkout.url}`);
    return Response.json({ url: checkout.url }, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Polar SDK errors often carry a structured body (bad product id, missing
    // scope, etc.). Log everything we can so the cause isn't a mystery.
    const detail = err instanceof Error && "body" in err ? (err as { body?: unknown }).body : undefined;
    console.error(
      `[checkout] Polar checkout create failed user=${user.id} env=${POLAR_ENV} products=${products.join(",")}: ${msg}` +
        (detail ? ` body=${JSON.stringify(detail)}` : ""),
    );
    return Response.json(
      { error: "Could not create checkout", ...(EXPOSE_ERRORS ? { detail: msg } : {}) },
      { status: 502, headers },
    );
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
