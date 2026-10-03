// Browser-side Reddit Pixel. Pairs with the server-side Conversions API in
// app/lib/reddit-capi.ts: conversions fire from both, sharing a conversion_id
// so Reddit deduplicates them (Events Manager → Deduplication).
//
//   • PageVisit — every React Router navigation (pixel only).
//   • SignUp    — /register queues it in REDDIT_PENDING_COOKIE (the action
//                 302s, so the pixel fires on the next page) + CAPI.
//   • Purchase  — on the hosted-checkout return (?checkout_id=) + CAPI from
//                 the Polar order.paid webhook, both keyed `checkout:<id>`.
//
// SSR-safe: every export no-ops when window is undefined.

import { useEffect } from "react";
import { useLocation } from "react-router";

export const REDDIT_PIXEL_ID = "a2_jse683cydg0p";
// Reddit appends ?rdt_cid= to ad landing URLs. The pixel reads it itself, but
// CAPI events (signup, webhook purchases) need it persisted server-readable.
export const REDDIT_CLICK_ID_COOKIE = "videly_rdt_cid";
// First-party id the pixel script sets; CAPI echoes it back as `uuid`.
export const REDDIT_UUID_COOKIE = "_rdt_uuid";
// "<EventName>:<conversionId>" set by the server for the pixel to replay.
export const REDDIT_PENDING_COOKIE = "videly_rdt_evt";

const CLICK_ID_MAX_AGE_DAYS = 28;

type RdtEvent = "PageVisit" | "SignUp" | "Purchase";
type Rdt = ((...args: unknown[]) => void) & { sendEvent?: (...a: unknown[]) => void; callQueue?: unknown[] };

declare global {
  interface Window {
    rdt?: Rdt;
  }
}

let initialized = false;
// Child effects (e.g. the checkout-return Purchase) run before the root hook
// inits the pixel; hold their events until then.
const queued: [RdtEvent, Record<string, unknown> | undefined][] = [];

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx !== -1 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

// Reddit's base snippet, minus the inline init/PageVisit (done below so we can
// pass advanced-matching keys and fire PageVisit per client navigation).
function loadPixel(user: { id: string; email?: string | null } | null): void {
  if (initialized) return;
  initialized = true;
  if (!window.rdt) {
    const p: Rdt = function (...args: unknown[]) {
      if (p.sendEvent) p.sendEvent(...args);
      else p.callQueue!.push(args);
    };
    p.callQueue = [];
    window.rdt = p;
    const t = document.createElement("script");
    t.src = `https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}`;
    t.async = true;
    document.head.appendChild(t);
  }
  const match: Record<string, string> = {};
  if (user?.email) match.email = user.email;
  if (user?.id) match.externalId = user.id;
  window.rdt!("init", REDDIT_PIXEL_ID, match);
}

export function rdtTrack(event: RdtEvent, metadata?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    if (!initialized || !window.rdt) {
      queued.push([event, metadata]);
      return;
    }
    if (metadata) window.rdt("track", event, metadata);
    else window.rdt("track", event);
  } catch {
    // ad tracking must never break the UI
  }
}

function persistClickId(): void {
  const cid = new URLSearchParams(window.location.search).get("rdt_cid");
  if (cid && /^[\w.-]{1,200}$/.test(cid)) writeCookie(REDDIT_CLICK_ID_COOKIE, cid, CLICK_ID_MAX_AGE_DAYS * 86400);
}

function flushPending(): void {
  const pending = readCookie(REDDIT_PENDING_COOKIE);
  if (!pending) return;
  writeCookie(REDDIT_PENDING_COOKIE, "", 0);
  const idx = pending.indexOf(":");
  const event = pending.slice(0, idx);
  const conversionId = pending.slice(idx + 1);
  if (event === "SignUp" && conversionId) rdtTrack("SignUp", { conversionId });
}

// Mounted once in the root App. Skipped while an admin is impersonating so
// support sessions don't count as ad traffic.
export function useRedditPixel(user: { id: string; email?: string | null } | null, disabled: boolean): void {
  const location = useLocation();
  useEffect(() => {
    if (disabled) return;
    persistClickId();
    loadPixel(user);
    rdtTrack("PageVisit");
    for (const [event, metadata] of queued.splice(0)) rdtTrack(event, metadata);
    flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.hash, disabled]);
}
