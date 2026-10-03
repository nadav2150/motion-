// POST /api/billing/checkout — creates a Polar checkout session for the signed
// in user and returns its hosted URL. We pass externalCustomerId = our Supabase
// user.id so Polar auto-creates/links the customer (no pre-mint step) and
// metadata carries userId/planTier/packKey for the webhook handler.
//
// BILLING_PROVIDER=dodo routes the same request to a Dodo Payments checkout
// session instead (see dodoCheckout below and lib/billing/dodo.ts).
//
// Body: { tier?, pack?, source? }
//   - tier (+ optional pack): a new subscription. Refused with 409
//     already_subscribed when the user already has a live subscription — a
//     plan switch goes through POST /api/billing/change-plan instead, so nobody
//     ends up paying for two subscriptions.
//   - pack alone: a one-time credit top-up, for free and paying users alike.
//   - source: which upsell surface sent the buyer (analytics only).

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
import { isPack, isTier, type PackSize, type PaidTier } from "../lib/billing/catalog";
import { findActiveSubscription } from "../lib/billing/subscription";
import { getPostHog } from "../lib/posthog";
import type { AuthUser } from "../lib/auth";
import { matchKeysFromRequest, matchKeysToMetadata } from "../lib/reddit-capi";

const POLAR_ENV = (process.env.POLAR_ENV ?? "sandbox").toLowerCase();
// Surface the real failure reason to the client only outside production, so we
// don't leak internals from videly.io while keeping sandbox/dev debuggable.
const EXPOSE_ERRORS = POLAR_ENV !== "production";

type Body = { tier?: string | null; pack?: string | null; source?: string | null };

// What is being bought. tier=null means a pack-only top-up.
type Order = { tier: PaidTier | null; pack: PackSize | null; source: string | null };

function cleanSource(v: unknown): string | null {
  return typeof v === "string" && /^[a-z0-9_:-]{1,40}$/i.test(v) ? v : null;
}

function successUrl(origin: string, order: Order): string {
  const params = new URLSearchParams();
  if (order.tier) params.set("upgraded", order.tier);
  else if (order.pack) params.set("purchased", `pack_${order.pack}`);
  if (order.tier && order.pack) params.set("pack", order.pack);
  if (order.source) params.set("source", order.source);
  return `${origin}/home?${params.toString()}`;
}

function metadataFor(user: AuthUser, order: Order, request: Request): Record<string, string> {
  // Polar rejects empty-string metadata values (each value must be a non-empty
  // string or a number/bool), so only attach keys that are set. The rdt* keys
  // carry the buyer's Reddit match keys to the order webhook (reddit-capi.ts).
  const metadata: Record<string, string> = { userId: user.id, ...matchKeysToMetadata(matchKeysFromRequest(request)) };
  if (order.tier) metadata.planTier = order.tier;
  if (order.pack) metadata.packKey = order.pack;
  if (order.source) metadata.source = order.source;
  return metadata;
}

function trackSession(user: AuthUser, order: Order, provider: string): void {
  try {
    getPostHog().capture({
      distinctId: user.id,
      event: "checkout_session_created",
      properties: {
        provider,
        kind: order.tier ? "subscription" : "pack",
        tier: order.tier,
        pack: order.pack,
        source: order.source,
      },
    });
  } catch {
    // best-effort
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);

  const body = (await request.json().catch(() => ({}))) as Body;
  const tier = body.tier ?? null;
  const pack = body.pack ?? null;
  if (tier !== null && !isTier(tier)) {
    return Response.json({ error: `Invalid tier "${tier}"` }, { status: 400, headers });
  }
  if (pack !== null && !isPack(pack)) {
    return Response.json({ error: `Invalid pack "${pack}"` }, { status: 400, headers });
  }
  if (tier === null && pack === null) {
    return Response.json({ error: "Choose a plan or a credit pack" }, { status: 400, headers });
  }
  const order: Order = { tier, pack, source: cleanSource(body.source) };

  if (order.tier) {
    try {
      const existing = await findActiveSubscription(user.id);
      if (existing) {
        return Response.json(
          { error: "already_subscribed", currentTier: existing.planTier, changePlanAvailable: !existing.cancelAtPeriodEnd },
          { status: 409, headers },
        );
      }
    } catch (err) {
      console.error(`[checkout] ${err instanceof Error ? err.message : String(err)} user=${user.id}`);
      return Response.json({ error: "Failed to load subscription" }, { status: 500, headers });
    }
  }

  if (billingProvider() === "dodo") {
    return dodoCheckout(request, user, headers, order);
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

  const products: string[] = [];
  if (order.tier) {
    const tierProduct = productIdForTier(order.tier);
    if (!tierProduct) {
      return Response.json(
        { error: `No Polar product configured for tier "${order.tier}". Set ${productEnvVarName(`PRODUCT_${order.tier.toUpperCase()}`)}.` },
        { status: 500, headers },
      );
    }
    products.push(tierProduct);
  }
  if (order.pack) {
    const packProduct = productIdForPack(order.pack);
    if (packProduct) products.push(packProduct);
    else if (!order.tier) {
      return Response.json(
        { error: `No Polar product configured for pack "${order.pack}". Set ${productEnvVarName(`PRODUCT_PACK_${order.pack.toUpperCase()}`)}.` },
        { status: 500, headers },
      );
    } else {
      console.warn(`[checkout] no Polar product for pack "${order.pack}" — continuing subscription only`);
      order.pack = null;
    }
  }

  const origin = new URL(request.url).origin;
  const metadata = metadataFor(user, order, request);

  console.log(
    `[checkout] creating session user=${user.id} tier=${order.tier ?? "none"} pack=${order.pack ?? "none"} ` +
      `source=${order.source ?? "none"} env=${POLAR_ENV} products=${products.join(",")}`,
  );

  try {
    const checkout = await getPolar().checkouts.create({
      products,
      externalCustomerId: user.id,
      metadata,
      // Polar swaps in the real id; the return page fires the Reddit Purchase
      // pixel with conversionId `checkout:<id>`, matching the webhook's CAPI event.
      successUrl: `${successUrl(origin, order)}&checkout_id={CHECKOUT_ID}`,
    });
    console.log(`[checkout] session created user=${user.id} checkout_id=${checkout.id} url=${checkout.url}`);
    trackSession(user, order, "polar");
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

// Same-origin page the buyer came from, so cancelling a pack top-up returns
// them to where they were instead of the pricing page.
function cancelUrlFor(request: Request, origin: string): string {
  const ref = request.headers.get("referer");
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.origin === origin && !u.pathname.startsWith("/checkout")) return u.toString();
    } catch {
      // ignore malformed referer
    }
  }
  return `${origin}/pricing`;
}

async function dodoCheckout(
  request: Request,
  user: AuthUser,
  headers: Headers,
  order: Order,
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

  const productIds: string[] = [];
  if (order.tier) {
    const tierProduct = dodoProductIdForTier(order.tier);
    if (!tierProduct) {
      return Response.json(
        { error: `No Dodo product configured for tier "${order.tier}". Set ${dodoEnvVarName(`PRODUCT_${order.tier.toUpperCase()}`)}.` },
        { status: 500, headers },
      );
    }
    productIds.push(tierProduct);
  }
  if (order.pack) {
    const packProduct = dodoProductIdForPack(order.pack);
    if (packProduct) productIds.push(packProduct);
    else if (!order.tier) {
      return Response.json(
        { error: `No Dodo product configured for pack "${order.pack}". Set ${dodoEnvVarName(`PRODUCT_PACK_${order.pack.toUpperCase()}`)}.` },
        { status: 500, headers },
      );
    } else {
      console.warn(`[checkout] no Dodo product for pack "${order.pack}" — continuing subscription only`);
      order.pack = null;
    }
  }

  const origin = new URL(request.url).origin;
  const metadata = metadataFor(user, order, request);
  console.log(
    `[checkout] creating Dodo session user=${user.id} tier=${order.tier ?? "none"} pack=${order.pack ?? "none"} ` +
      `source=${order.source ?? "none"} env=${env} products=${productIds.join(",")}`,
  );

  try {
    const session = await createCheckoutSession({
      productIds,
      email: user.email,
      metadata,
      returnUrl: successUrl(origin, order),
      cancelUrl: order.tier ? `${origin}/pricing` : cancelUrlFor(request, origin),
    });
    if (!session.checkout_url) throw new Error(`session ${session.session_id} has no checkout_url`);
    console.log(`[checkout] Dodo session created user=${user.id} session_id=${session.session_id}`);
    trackSession(user, order, "dodo");
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
