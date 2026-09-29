import type { Route } from "./+types/api.jobs.$id.timeline";
import { requireUserApi } from "../lib/auth";
import { getOwnedStudioJob } from "../lib/studio/db";
import { studioTimeline } from "../lib/studio/generate";

// GET /api/jobs/:id/timeline?rev=n&count=12 → { frames: { time, url }[] } (cached JPEGs)
export async function loader({ request, params }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }
  const url = new URL(request.url);
  const revision = url.searchParams.get("rev") ? Number(url.searchParams.get("rev")) : (row.current_revision ?? 0);
  const count = Math.round(Number(url.searchParams.get("count") ?? 12));
  if (!Number.isInteger(revision) || revision < 1) {
    return Response.json({ error: "Unknown revision" }, { status: 400, headers });
  }
  if (!Number.isFinite(count) || count < 1 || count > 24) {
    return Response.json({ error: "count must be 1–24" }, { status: 400, headers });
  }
  try {
    const frames = await studioTimeline(row, revision, count);
    return Response.json({ frames }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Revision not found" ? 404 : 500;
    if (status === 500) console.error(`/api/jobs/${row.id}/timeline failed:`, message);
    return Response.json({ error: message }, { status, headers });
  }
}
