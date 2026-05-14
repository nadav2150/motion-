import { useNavigate } from "react-router";
import type { Route } from "./+types/landing";
import { LandingScreen } from "../motionflow/screens/landing";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "MotionFlow AI — Cinematic launch videos" },
    { name: "description", content: "Transform screenshots, launches, and product updates into cinematic motion stories." },
  ];
}

export default function LandingRoute() {
  const navigate = useNavigate();
  return (
    <LandingScreen
      onCta={() => navigate("/register")}
      onSignIn={() => navigate("/signin")}
    />
  );
}
