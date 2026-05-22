import { useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/forgot-password";
import { ForgotPasswordScreen } from "../motionflow/screens/forgot-password";
import { AuthError, requestPasswordReset } from "../lib/auth";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Forgot password — Videly",
    description: "Reset your Videly password.",
    path: "/forgot-password",
    noIndex: true,
  });
}

type ActionData =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();

  const origin = new URL(request.url).origin;
  const redirectTo = `${origin}/reset-password`;

  try {
    await requestPasswordReset(email, redirectTo);
    return Response.json({ ok: true, email } satisfies ActionData);
  } catch (err) {
    const message =
      err instanceof AuthError ? err.message :
      err instanceof Error ? err.message :
      "Could not send reset link";
    return Response.json({ ok: false, error: message } satisfies ActionData, { status: 400 });
  }
}

export default function ForgotPasswordRoute() {
  const navigate = useNavigate();
  const actionData = useActionData() as ActionData | undefined;
  const sent = actionData?.ok === true;
  return (
    <ForgotPasswordScreen
      sent={sent}
      sentTo={sent ? actionData.email : undefined}
      error={actionData && !actionData.ok ? actionData.error : undefined}
      onGoSignIn={() => navigate("/signin")}
      onBack={() => navigate("/")}
    />
  );
}
