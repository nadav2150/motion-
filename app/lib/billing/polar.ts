// Server-side Polar SDK plus catalog lookup. POLAR_ENV switches between
// sandbox and production; the same code path serves both. The webhook handler
// uses the catalog map to turn a product_id into a plan tier or credit count
// without re-fetching the product on every event.

import { Polar } from "@polar-sh/sdk";
import type { PlanTier } from "./plan-features";

let cached: Polar | null = null;

function polarEnv(): "production" | "sandbox" {
  return (process.env.POLAR_ENV ?? "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

// Read a Polar env-scoped variable. POLAR_ENV=production picks
// POLAR_PRODUCTION_<NAME>; otherwise POLAR_SANDBOX_<NAME>.
function readPolarEnvVar(name: string): string | undefined {
  const prefix = polarEnv() === "production" ? "POLAR_PRODUCTION_" : "POLAR_SANDBOX_";
  return process.env[`${prefix}${name}`];
}

function readAccessToken(): string {
  const token = readPolarEnvVar("ACCESS_TOKEN");
  if (!token) {
    throw new Error(`POLAR_${polarEnv().toUpperCase()}_ACCESS_TOKEN must be set in .env`);
  }
  return token;
}

export function getPolar(): Polar {
  if (cached) return cached;
  cached = new Polar({ accessToken: readAccessToken(), server: polarEnv() });
  return cached;
}

export function getWebhookSecret(): string {
  const secret = readPolarEnvVar("WEBHOOK_SECRET");
  if (!secret) {
    throw new Error(
      `POLAR_${polarEnv().toUpperCase()}_WEBHOOK_SECRET must be set in .env (Polar dashboard → Webhooks → endpoint secret)`,
    );
  }
  return secret;
}

// True when Polar is configured. Gates in credits.ts short-circuit to
// "allowed" in dev environments without a Polar token.
export function isPolarConfigured(): boolean {
  return Boolean(readPolarEnvVar("ACCESS_TOKEN"));
}

// ─────────────────────────── Catalog ───────────────────────────

export type SubscriptionCatalogEntry = {
  kind: "subscription";
  planTier: PlanTier;
  monthlyGrant: number;
};
export type CreditPackCatalogEntry = {
  kind: "credit_pack";
  packSize: "small" | "medium" | "large";
  credits: number;
};
export type CatalogEntry = SubscriptionCatalogEntry | CreditPackCatalogEntry;

export function buildCatalog(): Record<string, CatalogEntry> {
  const map: Record<string, CatalogEntry> = {};
  const subs: Array<[string | undefined, PlanTier, number]> = [
    [readPolarEnvVar("PRODUCT_STARTER"), "starter", 8_000],
    [readPolarEnvVar("PRODUCT_PRO"),     "pro",     20_000],
    [readPolarEnvVar("PRODUCT_STUDIO"),  "studio",  60_000],
  ];
  for (const [id, planTier, monthlyGrant] of subs) {
    if (id) map[id] = { kind: "subscription", planTier, monthlyGrant };
  }
  const packs: Array<[string | undefined, "small" | "medium" | "large", number]> = [
    [readPolarEnvVar("PRODUCT_PACK_SMALL"),  "small",  5_000],
    [readPolarEnvVar("PRODUCT_PACK_MEDIUM"), "medium", 25_000],
    [readPolarEnvVar("PRODUCT_PACK_LARGE"),  "large",  75_000],
  ];
  for (const [id, packSize, credits] of packs) {
    if (id) map[id] = { kind: "credit_pack", packSize, credits };
  }
  return map;
}

// Catalog is rebuilt on demand (not cached) so tests can vary env between
// calls; production calls it once per webhook which is cheap.
export function lookupProduct(productId: string): CatalogEntry | null {
  return buildCatalog()[productId] ?? null;
}

// Resolve product ids for a checkout. Returns undefined when unconfigured so
// the route can return a clear error naming the env var.
export function productIdForTier(tier: "starter" | "pro" | "studio"): string | undefined {
  return readPolarEnvVar(`PRODUCT_${tier.toUpperCase()}`);
}

export function productIdForPack(size: "small" | "medium" | "large"): string | undefined {
  return readPolarEnvVar(`PRODUCT_PACK_${size.toUpperCase()}`);
}

export function productEnvVarName(name: string): string {
  return (polarEnv() === "production" ? "POLAR_PRODUCTION_" : "POLAR_SANDBOX_") + name;
}
