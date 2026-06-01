// POST /api/backoffice/impersonate — admin-gated. Mints a real session for the
// target user and hands it across to the app origin (videly.io) via an
// auto-submitting POST form carrying a short-lived HMAC-signed token. The
// form POSTs to <app-origin>/impersonate/start, which sets the cookies.
//
// Why a cross-origin handoff: backoffice.videly.io and videly.io are separate
// cookie jars (host-only cookies). See app/lib/impersonation.ts.

import type { Route } from "./+types/api.backoffice.impersonate";
import { requireAdminApi } from "../lib/admin";
import { REFRESH_COOKIE, parseCookies } from "../lib/auth";
import {
  appOriginFor,
  mintImpersonatedSession,
  signHandoff,
} from "../lib/impersonation";

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireAdminApi(request);

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  if (!email) {
    return Response.json({ error: "Missing target email" }, { status: 400, headers });
  }

  // The admin's own refresh token, so /impersonate/stop can restore them.
  const adminRefresh = parseCookies(request.headers.get("cookie"))[REFRESH_COOKIE];
  if (!adminRefresh) {
    return Response.json({ error: "Admin session missing refresh token" }, { status: 400, headers });
  }

  let session;
  try {
    session = await mintImpersonatedSession(email);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[impersonate] mint failed for ${email}: ${message}`);
    return Response.json({ error: "Failed to start impersonation" }, { status: 500, headers });
  }

  const token = signHandoff({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    admin_refresh: adminRefresh,
    target_email: email,
    admin_email: user.email ?? "",
  });

  const action = `${appOriginFor(request)}/impersonate/start`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Starting impersonation…</title></head>
<body style="background:#06070A;color:#E6E8EC;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<form id="handoff" method="post" action="${escapeAttr(action)}">
  <input type="hidden" name="token" value="${escapeAttr(token)}">
  <noscript><button type="submit">Continue</button></noscript>
</form>
<p>Starting impersonation of ${escapeAttr(email)}…</p>
<script>document.getElementById("handoff").submit();</script>
</body></html>`;

  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status: 200, headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
