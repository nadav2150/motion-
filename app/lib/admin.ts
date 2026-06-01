// Backoffice admin gating. There are no roles in the schema — admin access is
// an env allowlist (ADMIN_EMAILS, comma-separated). If the var is unset or
// empty, NOBODY is an admin (fail closed). See
// docs/superpowers/specs/2026-06-01-backoffice-admin-design.md.

import { getUserWithRefresh, setSessionCookies, type AuthUser } from "./auth";

/** Parsed, lowercased allowlist from the ADMIN_EMAILS env var. */
function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when `email` is on the allowlist. Case-insensitive; null ⇒ false. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}

/**
 * Guard for backoffice page loaders. Returns the admin user plus a Headers
 * object the loader must attach to its response (carries Set-Cookie from a
 * silent token refresh). Non-admins and unauthenticated requests are redirected
 * to /signin — we deliberately do NOT reveal that /backoffice exists.
 */
export async function requireAdminOrRedirect(
  request: Request,
): Promise<{ user: AuthUser; headers: Headers }> {
  const { user, refreshed } = await getUserWithRefresh(request);
  const headers = new Headers();
  if (refreshed) setSessionCookies(headers, refreshed);

  if (!user || !isAdmin(user.email)) {
    const url = new URL(request.url);
    const next = encodeURIComponent(url.pathname + url.search);
    headers.set("Location", `/signin?next=${next}`);
    throw new Response(null, { status: 302, headers });
  }

  return { user, headers };
}

/**
 * Guard for backoffice actions (returns JSON / form responses). Throws a 403
 * JSON Response for non-admins. Returns the admin user + refresh headers.
 */
export async function requireAdminApi(
  request: Request,
): Promise<{ user: AuthUser; headers: Headers }> {
  const { user, refreshed } = await getUserWithRefresh(request);
  const headers = new Headers();
  if (refreshed) setSessionCookies(headers, refreshed);

  if (!user || !isAdmin(user.email)) {
    headers.set("Content-Type", "application/json");
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers,
    });
  }

  return { user, headers };
}
