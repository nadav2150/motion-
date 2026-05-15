import { data, useNavigate } from "react-router";
import type { Route } from "./+types/home";
import { HomeScreen } from "../motionflow/screens/home";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Home — MotionFlow AI" }];
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
