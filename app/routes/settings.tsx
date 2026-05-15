import { data, useNavigate } from "react-router";
import type { Route } from "./+types/settings";
import { SettingsScreen } from "../motionflow/screens/settings";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Settings — MotionFlow AI" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireUserOrRedirect(request);
  return data({ ok: true }, { headers });
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
