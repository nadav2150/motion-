// Server-side Dodo Payments client plus catalog lookup. DODO_ENV switches
// between test_mode and live_mode; the same code path serves both. Mirrors
// polar.ts so the webhook handler can turn a product_id into a plan tier or
// credit count without re-fetching the product on every event.
//
// Plain fetch instead of the `dodopayments` SDK: we only call two endpoints
// (create checkout session, patch subscription) and verify Standard Webhooks
// signatures, so a dependency buys us nothing.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CatalogEntry } from "./polar";
import type { PlanTier } from "./plan-features";

export type DodoEnv = "test_mode" | "live_mode";

export function dodoEnv(): DodoEnv {
  return (process.env.DODO_ENV ?? "test_mode").toLowerCase() === "live_mode" ? "live_mode" : "test_mode";
}

function envPrefix(): string {
  return dodoEnv() === "live_mode" ? "DODO_LIVE_" : "DODO_TEST_";
}

// Read a Dodo env-scoped variable. DODO_ENV=live_mode picks DODO_LIVE_<NAME>;
// otherwise DODO_TEST_<NAME>.
function readDodoEnvVar(name: string): string | undefined {
  return process.env[`${envPrefix()}${name}`] || undefined;
}

export function dodoEnvVarName(name: string): string {
  return envPrefix() + name;
}

export function isDodoConfigured(): boolean {
  return Boolean(readDodoEnvVar("API_KEY"));
}

function apiBase(): string {
  return dodoEnv() === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

async function dodoFetch<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  const apiKey = readDodoEnvVar("API_KEY");
  if (!apiKey) throw new Error(`${dodoEnvVarName("API_KEY")} must be set`);
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Dodo ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type CreateCheckoutInput = {
  productIds: string[];
  email?: string | null;
  metadata: Record<string, string>;
  returnUrl: string;
  cancelUrl: string;
};

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<{ session_id: string; checkout_url: string | null }> {
  return dodoFetch("POST", "/checkouts", {
    product_cart: input.productIds.map((product_id) => ({ product_id, quantity: 1 })),
    ...(input.email ? { customer: { email: input.email } } : {}),
    metadata: input.metadata,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
  });
}

export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void> {
  await dodoFetch("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    cancel_at_next_billing_date: true,
  });
}

// ─────────────────────────── Webhook signatures ───────────────────────────

export class DodoWebhookVerificationError extends Error {}

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function getDodoWebhookSecret(): string {
  const secret = readDodoEnvVar("WEBHOOK_SECRET");
  if (!secret) {
    throw new Error(
      `${dodoEnvVarName("WEBHOOK_SECRET")} must be set (Dodo dashboard → Developer → Webhooks → endpoint signing secret)`,
    );
  }
  return secret;
}

// Standard Webhooks verification: HMAC-SHA256 over `${id}.${timestamp}.${body}`
// keyed with the base64-decoded secret (minus its `whsec_` prefix). The
// signature header holds space-separated `v1,<base64>` entries; any match wins.
export function verifyDodoWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): void {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!id || !timestamp || !signatureHeader) {
    throw new DodoWebhookVerificationError("missing webhook headers");
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new DodoWebhookVerificationError("timestamp outside tolerance");
  }
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return;
  }
  throw new DodoWebhookVerificationError("no matching signature");
}

// ─────────────────────────── Catalog ───────────────────────────

export function buildDodoCatalog(): Record<string, CatalogEntry> {
  const map: Record<string, CatalogEntry> = {};
  const subs: Array<[string | undefined, PlanTier, number]> = [
    [readDodoEnvVar("PRODUCT_STARTER"), "starter", 8_000],
    [readDodoEnvVar("PRODUCT_PRO"),     "pro",     20_000],
    [readDodoEnvVar("PRODUCT_STUDIO"),  "studio",  60_000],
  ];
  for (const [id, planTier, monthlyGrant] of subs) {
    if (id) map[id] = { kind: "subscription", planTier, monthlyGrant };
  }
  const packs: Array<[string | undefined, "small" | "medium" | "large", number]> = [
    [readDodoEnvVar("PRODUCT_PACK_SMALL"),  "small",  5_000],
    [readDodoEnvVar("PRODUCT_PACK_MEDIUM"), "medium", 25_000],
    [readDodoEnvVar("PRODUCT_PACK_LARGE"),  "large",  75_000],
  ];
  for (const [id, packSize, credits] of packs) {
    if (id) map[id] = { kind: "credit_pack", packSize, credits };
  }
  return map;
}

export function lookupDodoProduct(productId: string): CatalogEntry | null {
  return buildDodoCatalog()[productId] ?? null;
}

export function dodoProductIdForTier(tier: "starter" | "pro" | "studio"): string | undefined {
  return readDodoEnvVar(`PRODUCT_${tier.toUpperCase()}`);
}

export function dodoProductIdForPack(size: "small" | "medium" | "large"): string | undefined {
  return readDodoEnvVar(`PRODUCT_PACK_${size.toUpperCase()}`);
}

// Dodo subscription statuses (pending/active/on_hold/cancelled/failed/expired)
// mapped onto the values the rest of the app already queries ("active",
// "trialing", "canceled").
export function normalizeDodoStatus(status: unknown): string {
  const s = typeof status === "string" ? status.toLowerCase() : "active";
  return s === "cancelled" ? "canceled" : s;
}
