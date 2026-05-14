import type { Route } from "./+types/api.auth.reset-password";
import { AuthError, setSessionCookies, updatePasswordWithToken } from "../lib/auth";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { accessToken?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as { accessToken?: unknown; password?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    const session = await updatePasswordWithToken(accessToken, password);
    const headers = new Headers();
    setSessionCookies(headers, session);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    const message =
      err instanceof AuthError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Password reset failed";
    const status = err instanceof AuthError ? err.status : 500;
    return Response.json({ error: message }, { status });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
