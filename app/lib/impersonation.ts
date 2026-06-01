// Impersonation: full session takeover for the backoffice. See
// docs/superpowers/specs/2026-06-01-backoffice-admin-design.md.
//
// The backoffice (backoffice.videly.io) and the app (videly.io) are the same
// Worker/container but DIFFERENT cookie jars (host-only cookies). So takeover
// can't just set a cookie and redirect — it hands the impersonated session
// across origins via a short-lived HMAC-signed token delivered by an
// auto-submitting POST form. The token also carries the admin's own refresh
// token so /impersonate/stop can restore the admin afterwards (which also
// makes single-origin local dev work, where impersonation overwrites the
// admin's own session cookies).

import { createHmac, timingSafeEqual } from "node:crypto";
import { createAuthSupabaseClient, getSupabase } from "./supabase";
import { sessionCookieAttrs, parseCookies } from "./auth";

const HANDOFF_TTL_SEC = 60;

// Cookies set on the app origin during impersonation. The impersonated
// session itself reuses the normal mf_at/mf_rt cookies (see auth.ts).
const ADMIN_REFRESH_COOKIE = "mf_admin_rt"; // admin's refresh token, to return
const IMP_EMAIL_COOKIE = "mf_imp"; // impersonated user's email (banner)
const IMP_BY_COOKIE = "mf_imp_by"; // admin's email (banner)
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const ONE_HOUR = 60 * 60;

export type ImpersonatedSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type HandoffPayload = {
  /** Impersonated user's session. */
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** Admin's own refresh token, stashed so they can return to themselves. */
  admin_refresh: string;
  target_email: string | null;
  admin_email: string;
  /** Unix seconds expiry. */
  exp: number;
};

function secret(): string {
  const s = process.env.IMPERSONATION_SECRET;
  if (!s) throw new Error("IMPERSONATION_SECRET is not set");
  return s;
}

function hmac(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Sign a handoff payload into a `<body>.<sig>` token. */
export function signHandoff(payload: Omit<HandoffPayload, "exp">): string {
  const full: HandoffPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + HANDOFF_TTL_SEC,
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

/** Verify + decode a handoff token. Returns null on tamper or expiry. */
export function verifyHandoff(token: string | null | undefined): HandoffPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: HandoffPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    return null;
  }
  return payload;
}

/**
 * Mint a real Supabase session for `email` without their password and without
 * sending an email: admin generateLink (magiclink) → verifyOtp(token_hash).
 * Uses a fresh client for verifyOtp so it doesn't poison the shared client's
 * in-memory session (same reason as createAuthSupabaseClient in supabase.ts).
 */
export async function mintImpersonatedSession(
  email: string,
): Promise<ImpersonatedSession> {
  const admin = getSupabase();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    throw new Error(`generateLink failed: ${error?.message ?? "no hashed_token"}`);
  }

  // Verify the OTP to exchange the hash for a session. Magiclink-generated
  // hashes verify as type "email" on current GoTrue; fall back to "magiclink".
  for (const type of ["email", "magiclink"] as const) {
    const verifier = createAuthSupabaseClient();
    const { data: v, error: ve } = await verifier.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!ve && v.session) {
      return {
        access_token: v.session.access_token,
        refresh_token: v.session.refresh_token,
        expires_in: v.session.expires_in ?? ONE_HOUR,
      };
    }
  }
  throw new Error("verifyOtp failed for impersonation token");
}

/** App origin for a request (strips a `backoffice.` host prefix). */
export function appOriginFor(request: Request): string {
  const url = new URL(request.url);
  const host = url.host.replace(/^backoffice\./, "");
  return `${url.protocol}//${host}`;
}

export function setImpersonationCookies(
  headers: Headers,
  opts: { adminRefresh: string; targetEmail: string | null; adminEmail: string },
): void {
  headers.append(
    "Set-Cookie",
    `${ADMIN_REFRESH_COOKIE}=${encodeURIComponent(opts.adminRefresh)}; ${sessionCookieAttrs(THIRTY_DAYS)}`,
  );
  headers.append(
    "Set-Cookie",
    `${IMP_EMAIL_COOKIE}=${encodeURIComponent(opts.targetEmail ?? "")}; ${sessionCookieAttrs(THIRTY_DAYS)}`,
  );
  headers.append(
    "Set-Cookie",
    `${IMP_BY_COOKIE}=${encodeURIComponent(opts.adminEmail)}; ${sessionCookieAttrs(THIRTY_DAYS)}`,
  );
}

export function clearImpersonationCookies(headers: Headers): void {
  for (const name of [ADMIN_REFRESH_COOKIE, IMP_EMAIL_COOKIE, IMP_BY_COOKIE]) {
    headers.append("Set-Cookie", `${name}=; ${sessionCookieAttrs(0)}`);
  }
}

export function getAdminRefreshToken(request: Request): string | null {
  return parseCookies(request.headers.get("cookie"))[ADMIN_REFRESH_COOKIE] ?? null;
}

/** Banner info — non-null only while a request is impersonating. */
export function getImpersonation(
  request: Request,
): { email: string; by: string } | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  const email = cookies[IMP_EMAIL_COOKIE];
  if (!email) return null;
  return { email, by: cookies[IMP_BY_COOKIE] ?? "" };
}
