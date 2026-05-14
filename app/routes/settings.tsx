import { useNavigate } from "react-router";
import type { Route } from "./+types/settings";
import { SettingsScreen } from "../motionflow/screens/settings";
import type { NavKey } from "../motionflow/primitives";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Settings — MotionFlow AI" }];
}

const navPath: Record<NavKey, string> = {
  home: "/home",
  projects: "/projects",
  settings: "/settings",
};

export default function SettingsRoute() {
  const navigate = useNavigate();
  return <SettingsScreen onNav={(k) => navigate(navPath[k])}/>;
}
