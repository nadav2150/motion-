import type { Route } from "./+types/api.brand-kit";
import { requireUserApi } from "../lib/auth";
import { getOrCreateBilling } from "../lib/billing/credits";
import { getPlanFeatures } from "../lib/billing/plan-features";
import { EMPTY_BRAND_KIT, getBrandKit, parseBrandKit, storageHost, upsertBrandKit } from "../lib/studio/db";

// GET /api/brand-kit → BrandKit (empty kit when none saved)
export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  try {
    const kit = await getBrandKit(user.id);
    return Response.json(kit ?? EMPTY_BRAND_KIT, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500, headers });
  }
}

// PUT /api/brand-kit BrandKit → BrandKit
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const billing = await getOrCreateBilling(user.id);
  if (!getPlanFeatures(billing.plan_tier).brandKit) {
    return Response.json({ error: "Brand kits need a paid plan" }, { status: 403, headers });
  }
  const parsed = parseBrandKit(body, storageHost());
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400, headers });
  try {
    const kit = await upsertBrandKit(user.id, parsed.kit);
    return Response.json(kit, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500, headers });
  }
}
