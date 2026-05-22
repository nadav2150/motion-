// Server-side Paddle SDK plus catalog lookup. PADDLE_ENV switches between
// sandbox and live; the same code path serves both. Webhook handler uses the
// catalog map to turn an incoming price_id into a plan tier or credit count
// without needing to fetch the price entity from Paddle on every event.

import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import type { PlanTier } from "./plan-features";

let cached: Paddle | null = null;

function paddleEnv(): "live" | "sandbox" {
  return (process.env.PADDLE_ENV ?? "sandbox").toLowerCase() === "live" ? "live" : "sandbox";
}

// Read a Paddle env-scoped variable. PADDLE_ENV=live picks PADDLE_LIVE_<NAME>,
// PADDLE_ENV=sandbox picks PADDLE_SANDBOX_<NAME>. Returns undefined when the
// var isn't set so callers can decide whether to error or no-op.
function readPaddleEnvVar(name: string): string | undefined {
  const prefix = paddleEnv() === "live" ? "PADDLE_LIVE_" : "PADDLE_SANDBOX_";
  return process.env[`${prefix}${name}`];
}

function readEnvKey(): string {
  const key = readPaddleEnvVar("API_KEY");
  if (!key) {
    throw new Error(`PADDLE_${paddleEnv().toUpperCase()}_API_KEY must be set in .env`);
  }
  return key;
}

function paddleEnvironment(): Environment {
  return paddleEnv() === "live" ? Environment.production : Environment.sandbox;
}

export function getPaddle(): Paddle {
  if (cached) return cached;
  cached = new Paddle(readEnvKey(), { environment: paddleEnvironment() });
  return cached;
}

export function getWebhookSecret(): string {
  const secret = readPaddleEnvVar("WEBHOOK_SECRET");
  if (!secret) {
    throw new Error(
      `PADDLE_${paddleEnv().toUpperCase()}_WEBHOOK_SECRET must be set in .env (Paddle dashboard → Notifications → endpoint secret)`,
    );
  }
  return secret;
}

// ─────────────────────────── Catalog ───────────────────────────
//
// Map a Paddle price_id back to what it represents in our domain. Built once
// from env at module load — restarting the server picks up new env values.

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

function buildCatalog(): Record<string, CatalogEntry> {
  const map: Record<string, CatalogEntry> = {};
  const subs: Array<[string | undefined, PlanTier, number]> = [
    [readPaddleEnvVar("PRICE_STARTER"), "starter", 8_000],
    [readPaddleEnvVar("PRICE_PRO"),     "pro",     20_000],
    [readPaddleEnvVar("PRICE_STUDIO"),  "studio",  60_000],
  ];
  for (const [id, planTier, monthlyGrant] of subs) {
    if (id) map[id] = { kind: "subscription", planTier, monthlyGrant };
  }
  const packs: Array<[string | undefined, "small" | "medium" | "large", number]> = [
    [readPaddleEnvVar("PRICE_PACK_SMALL"),  "small",  5_000],
    [readPaddleEnvVar("PRICE_PACK_MEDIUM"), "medium", 25_000],
    [readPaddleEnvVar("PRICE_PACK_LARGE"),  "large",  75_000],
  ];
  for (const [id, packSize, credits] of packs) {
    if (id) map[id] = { kind: "credit_pack", packSize, credits };
  }
  return map;
}

let catalogCache: Record<string, CatalogEntry> | null = null;
export function getCatalog(): Record<string, CatalogEntry> {
  if (!catalogCache) catalogCache = buildCatalog();
  return catalogCache;
}

export function lookupPrice(priceId: string): CatalogEntry | null {
  return getCatalog()[priceId] ?? null;
}

// ─────────────────────── Customer helpers ──────────────────────

// Find an existing Paddle customer for an email, or create one. Cheaper than
// calling create() blindly (which 409s on duplicate email).
export async function getOrCreatePaddleCustomer(
  email: string,
  name?: string,
): Promise<{ id: string; email: string }> {
  const paddle = getPaddle();
  const lower = email.trim().toLowerCase();
  if (!lower) throw new Error("getOrCreatePaddleCustomer requires an email");

  // list() returns a paginated collection; the SDK exposes an async iterator.
  const collection = paddle.customers.list({ email: [lower] });
  for await (const c of collection) {
    if (c.email?.toLowerCase() === lower) {
      return { id: c.id, email: c.email };
    }
    break;
  }

  const created = await paddle.customers.create({ email: lower, name });
  return { id: created.id, email: created.email ?? lower };
}
