import type { Route } from "./+types/api.music.search";
import { searchTracks } from "../lib/jamendo-search";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return Response.json({ tracks: [] });
  }

  try {
    const tracks = await searchTracks(q, 20);
    return Response.json(
      { tracks },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`/api/music/search?q=${q} failed:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
