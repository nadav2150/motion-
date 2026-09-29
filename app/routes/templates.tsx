import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/templates";
import { TemplatesScreen } from "../motionflow/screens/templates";
import { loadAppContext, type AppContext } from "../motionflow/ui/session.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Templates — Videly" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, headers } = await loadAppContext(request);
  return data(ctx, { headers });
}

export default function TemplatesRoute() {
  const d = useLoaderData() as AppContext;
  return <TemplatesScreen user={d.user} planTier={d.planTier} credits={d.credits} />;
}
