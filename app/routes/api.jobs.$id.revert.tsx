import type { Route } from "./+types/api.jobs.$id.revert";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { getOwnedStudioJob, getRevision, IDLE_STAGES, stagePatch } from "../lib/studio/db";
import { STAGE_LABELS } from "../lib/studio/types";

// POST /api/jobs/:id/revert { revision } → { currentRevision }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const revision = Number(body.revision);
  const rev = Number.isInteger(revision) ? await getRevision(row.id, revision) : null;
  if (!rev) return Response.json({ error: "Unknown revision" }, { status: 400, headers });

  // Only while idle (compare-and-set on the stage label).
  const { data, error } = await getSupabase()
    .from("jobs")
    .update({
      current_revision: revision,
      ...stagePatch(rev.video_url ? "done" : "preview_ready"),
      ...(rev.video_url ? { final_video_url: rev.video_url, final_video_storage_path: rev.video_path } : {}),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("stage_label", IDLE_STAGES.map((s) => STAGE_LABELS[s]))
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500, headers });
  if (!data || data.length === 0) {
    return Response.json({ error: "This video is busy — wait for the current step to finish." }, { status: 409, headers });
  }
  return Response.json({ currentRevision: revision }, { headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
