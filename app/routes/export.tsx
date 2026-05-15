import { data, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/export";
import { ExportScreen } from "../motionflow/screens/export";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Export — MotionFlow AI" }];
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

export default function ExportRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const jobId = params.get("job");
  return (
    <ExportScreen
      jobId={jobId}
      onNav={(k) => navigate(navPath[k])}
      onNewProject={() => navigate("/editor?empty=1")}
      onBackToEditor={() => navigate(jobId ? `/editor?job=${jobId}` : "/editor")}
    />
  );
}
