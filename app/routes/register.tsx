import { useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/register";
import { RegisterScreen } from "../motionflow/screens/register";
import { AuthError, registerWithEmail, setSessionCookies } from "../lib/auth";
import { getOrCreateBilling, grantCredits } from "../lib/billing/credits";
import { buildMeta } from "../lib/seo";

// Free plan's monthly grant. Sized to exactly cover one worst-case 2-scene
// Free generation (1,100 base + 2 × 1,000 per-scene = 3,100). After the
// reservation refund settles, the user is left with whatever credits the
// generation didn't use (~1,200 on average) — not enough to start another
// 3,100-credit reservation, so the trial naturally caps at one render.
// Kept in sync with:
//  - app/motionflow/screens/pricing.tsx (Free perks copy + baseCredits)
//  - supabase/migrations/20260607_free_grant_3100.sql (column default
//    + existing free monthly_grant rows)
const SIGNUP_GRANT_CREDITS = 3_100;

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Create account — Videly",
    description: "Start free with Videly — no credit card required.",
    path: "/register",
    noIndex: true,
  });
}

type ActionData = { error: string };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim() || undefined;

  try {
    const { userId, ...session } = await registerWithEmail(email, password, name);

    // Grant the Free plan's starter credits. Idempotency key prevents
    // double-granting if the form is resubmitted. Failure here must not
    // block signup — we log and let the user reach /home with a 0 balance.
    try {
      await getOrCreateBilling(userId);
      await grantCredits({
        userId,
        amount: SIGNUP_GRANT_CREDITS,
        reason: "signup_grant_free_plan",
        idempotencyKey: `signup:${userId}`,
      });
    } catch (grantErr) {
      console.error(
        `[register] signup grant failed for user=${userId}:`,
        grantErr instanceof Error ? grantErr.message : grantErr,
      );
    }

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
