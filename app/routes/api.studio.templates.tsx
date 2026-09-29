import type { Route } from "./+types/api.studio.templates";
import { listTemplates, TEMPLATE_CATEGORIES } from "../lib/studio/templates";

// GET /api/studio/templates?category= → { items: StudioTemplate[] } (no auth)
export async function loader({ request }: Route.LoaderArgs) {
  const category = new URL(request.url).searchParams.get("category");
  if (category && category !== "all" && !TEMPLATE_CATEGORIES.some((c) => c.id === category)) {
    return Response.json({ error: "Unknown category" }, { status: 400 });
  }
  return Response.json(
    { items: listTemplates(category) },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
