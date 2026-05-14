import { redirect, useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/signin";
import { SignInScreen } from "../motionflow/screens/signin";
import { AuthError, setSessionCookies, signInWithEmail } from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Sign in — MotionFlow AI" },
    { name: "description", content: "Sign in to MotionFlow AI to continue editing your cinematic launch videos." },
  ];
}

type ActionData = { error: string };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  try {
    const session = await signInWithEmail(email, password);
    const headers = new Headers();
    setSessionCookies(headers, session);
    headers.append("Location", "/home");
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof AuthError ? err.message : err instanceof Error ? err.message : "Sign-in failed";
    return Response.json({ error: message } satisfies ActionData, { status: 400 });
  }
}

export default function SignInRoute() {
  const navigate = useNavigate();
  const actionData = useActionData() as ActionData | undefined;
  return (
    <SignInScreen
      error={actionData?.error}
      onGoRegister={() => navigate("/register")}
      onForgot={() => navigate("/forgot-password")}
      onBack={() => navigate("/")}
    />
  );
}
