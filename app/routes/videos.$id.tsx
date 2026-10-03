import { data, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/videos.$id";
import { VideoScreen } from "../motionflow/screens/video";
import { loadAppContext, type AppContext } from "../motionflow/ui/session.server";
import { isAdmin } from "../lib/admin";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Video — Videly" }];
}

// Ownership and the legacy redirect (generation_mode != 'v2' → /editor) are
// resolved client-side from GET /api/jobs/:id, which enforces ownership.
export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, headers } = await loadAppContext(request);
  return data({ ...ctx, isAdmin: isAdmin(ctx.user.email) }, { headers });
}

export default function VideoRoute() {
  const d = useLoaderData() as AppContext & { isAdmin: boolean };
  const { id } = useParams();
  return <VideoScreen key={id} user={d.user} planTier={d.planTier} credits={d.credits} jobId={id!} isAdmin={d.isAdmin} />;
}
