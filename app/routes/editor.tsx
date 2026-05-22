import { data, useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/editor";
import { EditorScreen } from "../motionflow/screens/editor";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";
import { loadCreditsForUI } from "../lib/billing/loader";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Editor — MotionFlow AI" }];
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

export default function EditorRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const empty = params.get("empty") === "1";
  const initialJobId = params.get("job");
  const { credits, planTier } = useLoaderData() as LoaderData;
  return (
    <EditorScreen
      key={initialJobId ?? "new"}
      initialJobId={initialJobId}
      credits={credits}
      planTier={planTier}
      onNav={(k) => navigate(navPath[k])}
      onContinue={(jobId) => navigate(jobId ? `/export?job=${jobId}` : "/export")}
      empty={empty}
    />
  );
}
