import { useNavigate } from "react-router";
import type { Route } from "./+types/reset-password";
import { ResetPasswordScreen } from "../motionflow/screens/reset-password";
import { buildMeta } from "../lib/seo";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Set a new password — Videly",
    description: "Set a new password for your Videly account.",
    path: "/reset-password",
    noIndex: true,
  });
}

export default function ResetPasswordRoute() {
  const navigate = useNavigate();
  return (
    <ResetPasswordScreen
      onDone={() => navigate("/home")}
      onBack={() => navigate("/signin")}
      onGoSignIn={() => navigate("/signin")}
    />
  );
}
