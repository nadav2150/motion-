import { data, useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/export";
import { ExportScreen } from "../motionflow/screens/export";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";
import { loadCreditsForUI } from "../lib/billing/loader";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Export — MotionFlow AI" }];
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

export default function ExportRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const jobId = params.get("job");
  const { credits } = useLoaderData() as LoaderData;
  return (
    <ExportScreen
      jobId={jobId}
      credits={credits}
      onNav={(k) => navigate(navPath[k])}
      onNewProject={() => navigate("/editor?empty=1")}
      onBackToEditor={() => navigate(jobId ? `/editor?job=${jobId}` : "/editor")}
    />
  );
}
