import { useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/editor";
import { EditorScreen } from "../motionflow/screens/editor";
import type { NavKey } from "../motionflow/primitives";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Editor — MotionFlow AI" }];
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
  return (
    <EditorScreen
      key={initialJobId ?? "new"}
      initialJobId={initialJobId}
      onNav={(k) => navigate(navPath[k])}
      onContinue={(jobId) => navigate(jobId ? `/export?job=${jobId}` : "/export")}
      empty={empty}
    />
  );
}
