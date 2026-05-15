import { redirect, useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/signin";
import { SignInScreen } from "../motionflow/screens/signin";
import {
  AuthError,
  getUserFromRequest,
  setSessionCookies,
  signInWithEmail,
} from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Sign in — MotionFlow AI" },
    { name: "description", content: "Sign in to MotionFlow AI to continue editing your cinematic launch videos." },
  ];
}

type ActionData = { error: string };

// Internal redirects only — never honor open-redirect destinations from the
// query string. `next` is allowed only when it starts with a single "/" and
// not "//" (protocol-relative).
function safeNext(raw: string | null): string {
  if (!raw) return "/home";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
  return raw;
}

export async function loader({ request }: Route.LoaderArgs) {
  // Already signed in — skip the form and continue to the originally
  // requested destination (or /home).
  const user = await getUserFromRequest(request);
  if (user) {
    const url = new URL(request.url);
    return redirect(safeNext(url.searchParams.get("next")));
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));

  try {
    const session = await signInWithEmail(email, password);
    const headers = new Headers();
    setSessionCookies(headers, session);
    headers.append("Location", next);
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
