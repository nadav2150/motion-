import { useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/register";
import { RegisterScreen } from "../motionflow/screens/register";
import { AuthError, registerWithEmail, setSessionCookies } from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Create account — MotionFlow AI" },
    { name: "description", content: "Start free with MotionFlow AI — no credit card required." },
  ];
}

type ActionData = { error: string };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim() || undefined;

  try {
    const session = await registerWithEmail(email, password, name);
    const headers = new Headers();
    setSessionCookies(headers, session);
    headers.append("Location", "/home");
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof AuthError ? err.message : err instanceof Error ? err.message : "Registration failed";
    return Response.json({ error: message } satisfies ActionData, { status: 400 });
  }
}

export default function RegisterRoute() {
  const navigate = useNavigate();
  const actionData = useActionData() as ActionData | undefined;
  return (
    <RegisterScreen
      error={actionData?.error}
      onGoSignIn={() => navigate("/signin")}
      onBack={() => navigate("/")}
    />
  );
}
