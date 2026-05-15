import type { Route } from "./+types/api.sfx.search";
import { searchSfx } from "../lib/freesound-search";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return Response.json({ sfx: [] });
  }

  try {
    const sfx = await searchSfx(q, 20);
    return Response.json(
      { sfx },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`/api/sfx/search?q=${q} failed:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
