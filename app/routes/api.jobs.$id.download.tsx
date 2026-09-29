import type { Route } from "./+types/api.jobs.$id.download";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { STORYBOARDS_BUCKET } from "../lib/storage";
import { getOwnedStudioJob, getRevision } from "../lib/studio/db";
import { downloadFilename } from "../lib/studio/format";

// GET /api/jobs/:id/download?rev=n → 302 to the MP4 (storage sets Content-Disposition)
export async function loader({ request, params }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }
  const url = new URL(request.url);
  const revision = url.searchParams.get("rev") ? Number(url.searchParams.get("rev")) : (row.current_revision ?? 0);
  const rev = Number.isInteger(revision) ? await getRevision(row.id, revision) : null;
  if (!rev) return Response.json({ error: "Revision not found" }, { status: 404, headers });
  if (!rev.video_path || rev.render_status !== "ready") {
    return Response.json({ error: "This version has not been exported yet" }, { status: 409, headers });
  }
  const { data } = getSupabase()
    .storage.from(STORYBOARDS_BUCKET)
    .getPublicUrl(rev.video_path, { download: downloadFilename(row.title, revision) });
  headers.set("Location", data.publicUrl);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}
