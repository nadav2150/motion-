// Backoffice admin gating. There are no roles in the schema — admin access is
// an env allowlist (ADMIN_EMAILS, comma-separated) plus BUILTIN_ADMINS. If the var is unset or
// empty, only BUILTIN_ADMINS are admins. See
// docs/superpowers/specs/2026-06-01-backoffice-admin-design.md.

import { getUserWithRefresh, setSessionCookies, type AuthUser } from "./auth";
import { sanitizeAttribution, type Attribution } from "./attribution";
import { getSupabase } from "./supabase";

// Dedicated backoffice login, always allowed in addition to ADMIN_EMAILS. The
// matching auth user already exists, so nobody else can register this address.
const BUILTIN_ADMINS = ["admin@videly.io"];

/** Parsed, lowercased allowlist from the ADMIN_EMAILS env var + built-ins. */
function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    [...raw.split(","), ...BUILTIN_ADMINS]
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
    // A signed-in non-admin must see the form (switch=1), or /signin would
    // bounce them straight back here and loop forever.
    headers.set("Location", `/signin?next=${next}${user ? "&switch=1" : ""}`);
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

export type UserMarketing = { attribution: Attribution | null; creditsGranted: number };

/**
 * Per-user signup attribution (auth metadata) and lifetime credits granted
 * (positive ledger entries, excluding reservation refunds) for a page of
 * backoffice users. Read through the service-role client — no RPC needed.
 */
export async function loadUserMarketing(userIds: string[]): Promise<Record<string, UserMarketing>> {
  const out: Record<string, UserMarketing> = {};
  if (!userIds.length) return out;
  const db = getSupabase();

  const [users, ledger] = await Promise.all([
    Promise.all(userIds.map((id) => db.auth.admin.getUserById(id))),
    db
      .from("credit_ledger")
      .select("user_id, delta")
      .in("user_id", userIds)
      .gt("delta", 0)
      .neq("kind", "refund"),
  ]);

  userIds.forEach((id, i) => {
    const meta = users[i]?.data.user?.user_metadata as Record<string, unknown> | undefined;
    out[id] = { attribution: sanitizeAttribution(meta?.attribution), creditsGranted: 0 };
  });
  if (ledger.error) {
    console.error(`[backoffice] credit_ledger read failed: ${ledger.error.message}`);
  }
  for (const row of (ledger.data ?? []) as { user_id: string; delta: number }[]) {
    if (out[row.user_id]) out[row.user_id].creditsGranted += Number(row.delta);
  }
  return out;
}
