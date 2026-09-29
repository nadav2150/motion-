import type { Route } from "./+types/api.studio.videos";
import { requireUserApi } from "../lib/auth";
import { listStudioVideos, VIDEO_FILTERS, type VideoFilter } from "../lib/studio/db";

// GET /api/studio/videos?filter=&q=&limit=&cursor= → { items, nextCursor }
export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  const url = new URL(request.url);
  const rawFilter = url.searchParams.get("filter") ?? "all";
  if (!(VIDEO_FILTERS as string[]).includes(rawFilter)) {
    return Response.json({ error: `filter must be one of ${VIDEO_FILTERS.join(", ")}` }, { status: 400, headers });
  }
  const limit = Number(url.searchParams.get("limit") ?? 24);
  try {
    const result = await listStudioVideos(user.id, {
      filter: rawFilter as VideoFilter,
      q: url.searchParams.get("q"),
      limit: Number.isFinite(limit) ? limit : 24,
      cursor: url.searchParams.get("cursor"),
    });
    return Response.json(result, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/studio/videos GET failed:", message);
    return Response.json({ error: message }, { status: 500, headers });
  }
}
