// First-touch marketing attribution (UTM params, ?ref= codes, referrer).
//
// The client records the first visit that carries attribution into a cookie;
// /register copies it into the new user's auth metadata (`attribution`), and
// the backoffice roster reads it from there (admin_list_users).

export const ATTRIBUTION_COOKIE = "videly_attr";
const MAX_AGE_DAYS = 90;
const MAX_LEN = 200;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
// Accepted spellings for a referral / affiliate code, first match wins.
const REF_KEYS = ["ref", "via", "referral", "aff"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  ref?: string;
  referrer?: string;
  landing_path?: string;
  first_seen_at?: string;
};

const FIELDS: (keyof Attribution)[] = [...UTM_KEYS, "ref", "referrer", "landing_path", "first_seen_at"];

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, MAX_LEN);
  return s || undefined;
}

/** Keep only known string fields, trimmed and length-capped. Null when empty. */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Attribution = {};
  for (const k of FIELDS) {
    const v = clean((raw as Record<string, unknown>)[k]);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Server: read the attribution cookie off a request. */
export function readAttribution(request: Request): Attribution | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1 || part.slice(0, idx).trim() !== ATTRIBUTION_COOKIE) continue;
    try {
      return sanitizeAttribution(JSON.parse(decodeURIComponent(part.slice(idx + 1).trim())));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Client: record first-touch attribution for this browser. A visit counts when
 * it carries UTM params / a ref code, or arrives from another site. Once the
 * cookie exists it is never overwritten (first touch wins).
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  if (document.cookie.split(";").some((c) => c.trim().startsWith(`${ATTRIBUTION_COOKIE}=`))) return;

  const params = new URLSearchParams(window.location.search);
  const found: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) found[k] = v;
  }
  for (const k of REF_KEYS) {
    const v = params.get(k);
    if (v) {
      found.ref = v;
      break;
    }
  }

  let referrer: string | undefined;
  try {
    if (document.referrer && new URL(document.referrer).hostname !== window.location.hostname) {
      referrer = document.referrer;
    }
  } catch {
    // malformed referrer — ignore
  }
  if (!Object.keys(found).length && !referrer) return;

  const attr = sanitizeAttribution({
    ...found,
    referrer,
    landing_path: window.location.pathname,
    first_seen_at: new Date().toISOString(),
  });
  if (!attr) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(attr))}; Path=/; ` +
    `Max-Age=${MAX_AGE_DAYS * 86400}; SameSite=Lax${secure}`;
}
