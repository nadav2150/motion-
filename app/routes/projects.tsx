import { redirect } from "react-router";
import type { Route } from "./+types/projects";

// /projects was replaced by /videos (My Videos) in v2.
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(`/videos${url.search}`, 301);
}
