import { useNavigate } from "react-router";
import type { Route } from "./+types/reset-password";
import { ResetPasswordScreen } from "../motionflow/screens/reset-password";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Set a new password — MotionFlow AI" },
    { name: "description", content: "Set a new password for your MotionFlow AI account." },
  ];
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
