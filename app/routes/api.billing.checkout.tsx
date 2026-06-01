// POST /api/billing/checkout — creates a Polar checkout session for the signed
// in user and returns its hosted URL. We pass externalCustomerId = our Supabase
// user.id so Polar auto-creates/links the customer (no pre-mint step) and
// metadata carries userId/planTier/packKey for the webhook handler.

import type { Route } from "./+types/api.billing.checkout";
import { requireUserApi } from "../lib/auth";
import {
  getPolar,
  productEnvVarName,
  productIdForPack,
  productIdForTier,
} from "../lib/billing/polar";

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

  try {
    const checkout = await getPolar().checkouts.create({
      products,
      externalCustomerId: user.id,
      metadata: {
        userId: user.id,
        planTier: tier,
        packKey: isPack(pack) ? pack : "",
      },
      successUrl: `${origin}/home?upgraded=${tier}`,
    });
    return Response.json({ url: checkout.url }, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[checkout] Polar checkout create failed for ${user.id}: ${msg}`);
    return Response.json({ error: "Could not create checkout" }, { status: 502, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
