import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/assets";
import { AssetsScreen } from "../motionflow/screens/assets";
import { loadAppContext, type AppContext } from "../motionflow/ui/session.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Assets — Videly" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, headers } = await loadAppContext(request);
  return data(ctx, { headers });
}

export default function AssetsRoute() {
  const d = useLoaderData() as AppContext;
  return <AssetsScreen user={d.user} planTier={d.planTier} credits={d.credits} />;
}
