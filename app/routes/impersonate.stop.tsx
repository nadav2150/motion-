// POST /impersonate/stop — ends impersonation. Restores the admin's own
// session from the stashed refresh token (mf_admin_rt), clears the
// impersonation cookies, and returns the admin to /backoffice. Restoring from
// the refresh token (rather than relying on the backoffice cookie jar) is what
// makes this work both across subdomains in prod and on a single origin in
// local dev.

import type { Route } from "./+types/impersonate.stop";
import { setSessionCookies, clearSessionCookies } from "../lib/auth";
import { createAuthSupabaseClient } from "../lib/supabase";
import { clearImpersonationCookies, getAdminRefreshToken } from "../lib/impersonation";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const headers = new Headers();
  clearImpersonationCookies(headers);

  const adminRefresh = getAdminRefreshToken(request);
  if (adminRefresh) {
    try {
      const client = createAuthSupabaseClient();
      const { data, error } = await client.auth.refreshSession({
        refresh_token: adminRefresh,
      });
      if (!error && data.session) {
        setSessionCookies(headers, {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in ?? 3600,
        });
        headers.set("Location", "/backoffice");
        return new Response(null, { status: 302, headers });
      }
    } catch (err) {
      console.error(`[impersonate] failed to restore admin session: ${err}`);
    }
  }

  // No/expired admin refresh: drop the impersonated session and send to signin.
  clearSessionCookies(headers);
  headers.set("Location", "/signin");
  return new Response(null, { status: 302, headers });
}

export function loader() {
  return new Response("Method not allowed", { status: 405 });
}
