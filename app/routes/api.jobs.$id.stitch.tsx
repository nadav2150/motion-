import type { Route } from "./+types/api.jobs.$id.stitch";
import { stitchJobFinal } from "../lib/stitcher";
import { getSupabase } from "../lib/supabase";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

  const db = getSupabase();
  const { data: job, error: jobErr } = await db
    .from("jobs")
    .select("id, final_video_status")
    .eq("id", id)
    .maybeSingle();
  if (jobErr) {
    return Response.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.final_video_status === "building") {
    return Response.json({ error: "Final video is already building" }, { status: 409 });
  }

  // Refuse if any shot is not ready.
  const { data: shots, error: shotsErr } = await db
    .from("shots")
    .select("id, clip_status, clip_url")
    .eq("job_id", id);
  if (shotsErr) {
    return Response.json({ error: shotsErr.message }, { status: 500 });
  }
  if (!shots || shots.length === 0) {
    return Response.json({ error: "Job has no shots" }, { status: 409 });
  }
  const notReady = shots.filter((s) => s.clip_status !== "ready" || !s.clip_url);
  if (notReady.length > 0) {
    return Response.json(
      {
        error: `${notReady.length} of ${shots.length} shots are not ready yet. Generate clips for every shot first.`,
      },
      { status: 409 },
    );
  }

  // Flip status synchronously so the client sees feedback immediately.
  await db
    .from("jobs")
    .update({ final_video_status: "building", final_video_error: null })
    .eq("id", id);

  void stitchJobFinal(id).catch((err) => {
    console.error(`stitchJobFinal(${id}) threw:`, err);
  });

  return Response.json({ jobId: id });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
