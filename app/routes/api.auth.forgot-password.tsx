import type { Route } from "./+types/api.auth.forgot-password";
import { sendPasswordResetEmail } from "../lib/auth";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  let body: { email?: unknown } = {};
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  if (!email.trim()) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const redirectTo = `${origin}/reset-password`;

  // Always 200 — never reveal whether an account exists.
  try {
    await sendPasswordResetEmail(email, redirectTo);
  } catch (err) {
    console.warn(
      "forgot-password swallow:",
      err instanceof Error ? err.message : err,
    );
  }
  return Response.json({ ok: true });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
