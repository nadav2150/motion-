// POST /impersonate/start — handoff target on the app origin. Verifies the
// signed token from the backoffice, installs the impersonated session in the
// app's cookie jar, stashes the admin's refresh token (to return), and lands
// the admin on /home as the target user. Security rests on the HMAC-signed,
// short-lived token (see app/lib/impersonation.ts) — this route is not
// admin-gated because the admin isn't authenticated on this origin.

import type { Route } from "./+types/impersonate.start";
import { setSessionCookies } from "../lib/auth";
import { setImpersonationCookies, verifyHandoff } from "../lib/impersonation";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const form = await request.formData();
  const payload = verifyHandoff(String(form.get("token") ?? ""));
  if (!payload) {
    return new Response("Impersonation link is invalid or expired.", { status: 400 });
  }

  const headers = new Headers();
  setSessionCookies(headers, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
  });
  setImpersonationCookies(headers, {
    adminRefresh: payload.admin_refresh,
    targetEmail: payload.target_email,
    adminEmail: payload.admin_email,
  });
  headers.set("Location", "/home");
  return new Response(null, { status: 302, headers });
}

export function loader() {
  return new Response("Method not allowed", { status: 405 });
}
