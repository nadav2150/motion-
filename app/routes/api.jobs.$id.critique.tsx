import type { Route } from "./+types/api.jobs.$id.critique";
import { critiqueAndPolishJob } from "../lib/jobs";
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
    .select("id, status, generation_mode, blueprint, scene_contexts, film_fills, polished_at")
    .eq("id", id)
    .maybeSingle();
  if (jobErr) {
    return Response.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.generation_mode !== "hyperframes") {
    return Response.json(
      { error: "Critique route is only valid for hyperframes jobs" },
      { status: 409 },
    );
  }
  if (job.status !== "scenes_ready") {
    return Response.json(
      { error: `Cannot critique from status="${job.status}"; needs "scenes_ready"` },
      { status: 409 },
    );
  }
  if (!job.blueprint || !job.scene_contexts || !job.film_fills) {
    return Response.json(
      {
        error:
          "Job is not eligible for polish — missing persisted state. Jobs created before the polish endpoint migration cannot be polished retroactively; re-run the job.",
      },
      { status: 409 },
    );
  }

  // Fire-and-forget; client polls /api/jobs/:id for status transitions.
  void critiqueAndPolishJob(id).catch((err) => {
    console.error(`critiqueAndPolishJob(${id}) threw:`, err);
  });

  return Response.json({ jobId: id });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
