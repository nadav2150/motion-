import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/settings";
import { SettingsScreen } from "../motionflow/screens/settings";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";
import { loadCreditsForUI } from "../lib/billing/loader";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Settings — Videly AI" }];
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

export default function SettingsRoute() {
  const navigate = useNavigate();
  const { credits } = useLoaderData() as LoaderData;
  return <SettingsScreen credits={credits} onNav={(k) => navigate(navPath[k])}/>;
}
