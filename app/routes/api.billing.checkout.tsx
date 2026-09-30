// POST /api/billing/checkout — creates a Polar checkout session for the signed
// in user and returns its hosted URL. We pass externalCustomerId = our Supabase
// user.id so Polar auto-creates/links the customer (no pre-mint step) and
// metadata carries userId/planTier/packKey for the webhook handler.
//
// BILLING_PROVIDER=dodo routes the same request to a Dodo Payments checkout
// session instead (see dodoCheckout below and lib/billing/dodo.ts).

import type { Route } from "./+types/api.billing.checkout";
import { requireUserApi } from "../lib/auth";
import {
  getPolar,
  isPolarConfigured,
  productEnvVarName,
  productIdForPack,
  productIdForTier,
} from "../lib/billing/polar";
import {
  createCheckoutSession,
  dodoEnv,
  dodoEnvVarName,
  dodoProductIdForPack,
  dodoProductIdForTier,
  isDodoConfigured,
} from "../lib/billing/dodo";
import { billingProvider } from "../lib/billing/provider";
import type { AuthUser } from "../lib/auth";

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

  if (billingProvider() === "dodo") {
    return dodoCheckout(request, user, headers, tier, body.pack);
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

async function dodoCheckout(
  request: Request,
  user: AuthUser,
  headers: Headers,
  tier: "starter" | "pro" | "studio",
  pack: string | null | undefined,
): Promise<Response> {
  const env = dodoEnv();
  const exposeErrors = env !== "live_mode";

  if (!isDodoConfigured()) {
    const missing = dodoEnvVarName("API_KEY");
    console.error(`[checkout] Dodo not configured: ${missing} is empty (DODO_ENV=${env})`);
    return Response.json(
      { error: "Billing is not configured", ...(exposeErrors ? { detail: `${missing} is not set (DODO_ENV=${env})` } : {}) },
      { status: 500, headers },
    );
  }

  const tierProduct = dodoProductIdForTier(tier);
  if (!tierProduct) {
    return Response.json(
      { error: `No Dodo product configured for tier "${tier}". Set ${dodoEnvVarName(`PRODUCT_${tier.toUpperCase()}`)}.` },
      { status: 500, headers },
    );
  }

  const productIds: string[] = [tierProduct];
  const metadata: Record<string, string> = { userId: user.id, planTier: tier };
  if (isPack(pack)) {
    const packProduct = dodoProductIdForPack(pack);
    if (packProduct) {
      productIds.push(packProduct);
      metadata.packKey = pack;
    } else {
      console.warn(`[checkout] no Dodo product for pack "${pack}" — continuing subscription only`);
    }
  }

  const origin = new URL(request.url).origin;
  console.log(
    `[checkout] creating Dodo session user=${user.id} tier=${tier} pack=${metadata.packKey ?? "none"} ` +
      `env=${env} products=${productIds.join(",")}`,
  );

  try {
    const session = await createCheckoutSession({
      productIds,
      email: user.email,
      metadata,
      returnUrl: `${origin}/home?upgraded=${tier}`,
      cancelUrl: `${origin}/pricing`,
    });
    if (!session.checkout_url) throw new Error(`session ${session.session_id} has no checkout_url`);
    console.log(`[checkout] Dodo session created user=${user.id} session_id=${session.session_id}`);
    return Response.json({ url: session.checkout_url }, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[checkout] Dodo checkout create failed user=${user.id} env=${env} products=${productIds.join(",")}: ${msg}`);
    return Response.json(
      { error: "Could not create checkout", ...(exposeErrors ? { detail: msg } : {}) },
      { status: 502, headers },
    );
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
