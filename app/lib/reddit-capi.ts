// Server-side Reddit Conversions API (v3). Mirrors the browser pixel in
// app/lib/reddit-pixel.ts; both sides send the same conversion_id so Reddit
// deduplicates (the event with more match keys wins, usually this one).
//
// Silent no-op when REDDIT_CAPI_TOKEN is unset (local dev). Never throws —
// ad attribution must not break signup or webhook processing.
//
// Docs: https://ads-api.reddit.com/docs/v3/guides/programs/capi/direct-integration

import { createHash } from "node:crypto";
import { REDDIT_CLICK_ID_COOKIE, REDDIT_PIXEL_ID, REDDIT_UUID_COOKIE } from "./reddit-pixel";
import { getSupabase } from "./supabase";

const ENDPOINT = `https://ads-api.reddit.com/api/v3/pixels/${REDDIT_PIXEL_ID}/conversion_events`;
const TIMEOUT_MS = 5000;

export type RedditMatchKeys = {
  email?: string | null;
  externalId?: string | null;
  clickId?: string | null;
  uuid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type RedditConversion = {
  type: "SIGN_UP" | "PURCHASE";
  conversionId: string;
  match: RedditMatchKeys;
  value?: number;
  currency?: string;
  sourceUrl?: string;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Reddit's canonical form: lowercase, drop dots and any +suffix in the local part.
export function normalizeEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  const local = lower.slice(0, at).split("+")[0].replace(/\./g, "");
  return `${local}${lower.slice(at)}`;
}

export function buildRedditEvent(c: RedditConversion, now = Date.now()): Record<string, unknown> {
  const user: Record<string, string> = {};
  if (c.match.email) user.email = sha256(normalizeEmail(c.match.email));
  if (c.match.externalId) user.external_id = sha256(c.match.externalId);
  if (c.match.uuid) user.uuid = c.match.uuid;
  if (c.match.ip) user.ip_address = c.match.ip;
  if (c.match.userAgent) user.user_agent = c.match.userAgent;

  const metadata: Record<string, unknown> = { conversion_id: c.conversionId };
  if (c.value !== undefined && c.currency) {
    metadata.value = c.value;
    metadata.currency = c.currency.toUpperCase();
    metadata.item_count = 1;
  }

  return {
    event_at: now,
    action_source: "WEBSITE",
    type: { tracking_type: c.type },
    ...(c.match.clickId ? { click_id: c.match.clickId } : {}),
    ...(c.sourceUrl ? { event_source_url: c.sourceUrl } : {}),
    user,
    metadata,
  };
}

export async function sendRedditConversion(c: RedditConversion): Promise<void> {
  const token = process.env.REDDIT_CAPI_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { events: [buildRedditEvent(c)] } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      console.error(`[reddit-capi] ${c.type} ${c.conversionId} failed: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error(`[reddit-capi] ${c.type} ${c.conversionId} error:`, err instanceof Error ? err.message : err);
  }
}

function cookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx !== -1 && part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim()) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Match keys available from a live browser request (click id, pixel uuid, IP, UA). */
export function matchKeysFromRequest(request: Request): RedditMatchKeys {
  const h = request.headers;
  const cookies = h.get("Cookie") ?? "";
  const ip = h.get("CF-Connecting-IP") ?? h.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
  return {
    clickId: cookie(cookies, REDDIT_CLICK_ID_COOKIE),
    uuid: cookie(cookies, REDDIT_UUID_COOKIE),
    ip,
    userAgent: h.get("User-Agent"),
  };
}

// Polar metadata values must be non-empty strings ≤ 500 chars, so these keys
// are only attached when present. Carried checkout → order so the webhook,
// which has no browser request, can still send the shopper's match keys.
const META_KEYS = { clickId: "rdtCid", uuid: "rdtUuid", ip: "rdtIp", userAgent: "rdtUa" } as const;

export function matchKeysToMetadata(m: RedditMatchKeys): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, metaKey] of Object.entries(META_KEYS)) {
    const v = m[k as keyof typeof META_KEYS];
    if (v) out[metaKey] = v.slice(0, 500);
  }
  return out;
}

/**
 * PURCHASE from a payment webhook (Dodo payment.succeeded / Polar order.paid).
 * Fires once per checkout: payments without our metadata.rdtConv are skipped,
 * $0 payments (trial starts) are skipped, and a billing_events row keyed on
 * the conversion id stops renewals that inherit the checkout metadata from
 * re-sending. So a trial checkout reports on its first real charge.
 */
export async function reportRedditPurchase(p: {
  metadata: Record<string, unknown> | null | undefined;
  amountCents: number;
  currency: string | null | undefined;
  email: string | null | undefined;
  externalId: string | null | undefined;
}): Promise<void> {
  const conversionId = p.metadata?.rdtConv;
  if (typeof conversionId !== "string" || !conversionId || !(p.amountCents > 0)) return;
  if (!process.env.REDDIT_CAPI_TOKEN) return;
  const { error } = await getSupabase()
    .from("billing_events")
    .insert({ event_id: `reddit_purchase:${conversionId}`, event_type: "reddit.purchase" });
  if (error) {
    if (error.code !== "23505") console.error(`[reddit-capi] purchase guard insert failed: ${error.message}`);
    return;
  }
  await sendRedditConversion({
    type: "PURCHASE",
    conversionId,
    value: p.amountCents / 100,
    currency: p.currency ?? "USD",
    match: { ...matchKeysFromMetadata(p.metadata), email: p.email, externalId: p.externalId },
  });
}

export function matchKeysFromMetadata(meta: Record<string, unknown> | null | undefined): RedditMatchKeys {
  const out: RedditMatchKeys = {};
  if (!meta) return out;
  for (const [k, metaKey] of Object.entries(META_KEYS)) {
    const v = meta[metaKey];
    if (typeof v === "string" && v) out[k as keyof typeof META_KEYS] = v;
  }
  return out;
}
