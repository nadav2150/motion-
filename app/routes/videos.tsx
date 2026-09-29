import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/videos";
import { VideosScreen } from "../motionflow/screens/videos";
import { loadAppContext, type AppContext } from "../motionflow/ui/session.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "My Videos — Videly" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, headers } = await loadAppContext(request);
  return data(ctx, { headers });
}

export default function VideosRoute() {
  const d = useLoaderData() as AppContext;
  return <VideosScreen user={d.user} planTier={d.planTier} credits={d.credits} />;
}
