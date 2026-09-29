import type { Route } from "./+types/api.jobs.$id.export";
import { exportJob } from "../lib/jobs";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

  const { user, headers } = await requireUserApi(request);

  const db = getSupabase();
  const { data: job, error: jobErr } = await db
    .from("jobs")
    .select("id, user_id, status, generation_mode")
    .eq("id", id)
    .maybeSingle();
  if (jobErr) {
    return Response.json({ error: jobErr.message }, { status: 500, headers });
  }
  // Someone else's job is indistinguishable from a missing one.
  if (!job || job.user_id !== user.id) {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }
  if (job.generation_mode !== "hyperframes") {
    return Response.json(
      { error: "Export route is only valid for hyperframes jobs" },
      { status: 409, headers },
    );
  }
  if (job.status !== "scenes_ready") {
    return Response.json(
      { error: `Cannot export from status="${job.status}"; needs "scenes_ready"` },
      { status: 409, headers },
    );
  }

  // Fire-and-forget; client polls /api/jobs/:id for status.
  void exportJob(id).catch((err) => {
    console.error(`exportJob(${id}) threw:`, err);
  });

  return Response.json({ jobId: id }, { headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
