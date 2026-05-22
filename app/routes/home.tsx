import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/home";
import { HomeScreen } from "../motionflow/screens/home";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";
import { loadCreditsForUI } from "../lib/billing/loader";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Home — MotionFlow AI" }];
}

type LoaderData = { credits: number | null; planTier: string | null };

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserOrRedirect(request);
  const { credits, planTier } = await loadCreditsForUI(user.id);
  return data({ credits, planTier } satisfies LoaderData, { headers });
}

const navPath: Record<NavKey, string> = {
  home: "/home",
  projects: "/projects",
  settings: "/settings",
};

export default function HomeRoute() {
  const navigate = useNavigate();
  const { credits } = useLoaderData() as LoaderData;
  return (
    <HomeScreen
      credits={credits}
      onNav={(k) => navigate(navPath[k])}
      onPickTemplate={() => navigate("/editor")}
      onNewBlank={() => navigate("/editor?empty=1")}
      onSeePricing={() => navigate("/pricing")}
    />
  );
}
