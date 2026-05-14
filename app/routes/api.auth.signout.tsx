import type { Route } from "./+types/api.auth.signout";
import { clearSessionCookies } from "../lib/auth";

export async function action(_: Route.ActionArgs) {
  const headers = new Headers();
  clearSessionCookies(headers);
  headers.append("Location", "/");
  return new Response(null, { status: 302, headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
