import { useNavigate } from "react-router";
import type { Route } from "./+types/home";
import { HomeScreen } from "../motionflow/screens/home";
import type { NavKey } from "../motionflow/primitives";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Home — MotionFlow AI" }];
}

const navPath: Record<NavKey, string> = {
  home: "/home",
  projects: "/projects",
  settings: "/settings",
};

export default function HomeRoute() {
  const navigate = useNavigate();
  return (
    <HomeScreen
      onNav={(k) => navigate(navPath[k])}
      onPickTemplate={() => navigate("/editor")}
      onNewBlank={() => navigate("/editor?empty=1")}
    />
  );
}
