import { useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/export";
import { ExportScreen } from "../motionflow/screens/export";
import type { NavKey } from "../motionflow/primitives";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Export — MotionFlow AI" }];
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
