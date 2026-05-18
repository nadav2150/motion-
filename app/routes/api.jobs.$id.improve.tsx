import type { Route } from "./+types/api.jobs.$id.improve";
import { improveScenesFromComments } from "../lib/jobs";
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
    .select("id, status, generation_mode, blueprint, scene_contexts, film_fills")
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
      { error: "Improve route is only valid for hyperframes jobs" },
      { status: 409 },
    );
  }
  if (job.status !== "scenes_ready") {
    return Response.json(
      { error: `Cannot improve from status="${job.status}"; needs "scenes_ready"` },
      { status: 409 },
    );
  }
  if (!job.blueprint || !job.scene_contexts || !job.film_fills) {
    return Response.json(
      {
        error:
          "Job is not eligible for improvement — missing persisted state. Jobs created before the polish endpoint migration cannot be improved retroactively; re-run the job.",
      },
      { status: 409 },
    );
  }

  // Check at least one shot has a non-empty comments array. Avoids a no-op
  // LLM round-trip and gives the caller a clear error message.
  const { data: shotsData, error: shotsErr } = await db
    .from("shots")
    .select("comments")
    .eq("job_id", id);
  if (shotsErr) {
    return Response.json({ error: shotsErr.message }, { status: 500 });
  }
  const hasAnyComment = (shotsData ?? []).some((row) => {
    const c = (row as { comments?: unknown }).comments;
    return Array.isArray(c) && c.length > 0;
  });
  if (!hasAnyComment) {
    return Response.json(
      { error: "Add comments to at least one scene first." },
      { status: 409 },
    );
  }

  // Fire-and-forget; client polls /api/jobs/:id for status transitions.
  void improveScenesFromComments(id).catch((err) => {
    console.error(`improveScenesFromComments(${id}) threw:`, err);
  });

  return Response.json({ jobId: id });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
