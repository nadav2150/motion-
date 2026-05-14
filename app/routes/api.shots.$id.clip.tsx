import type { Route } from "./+types/api.shots.$id.clip";
import { generateClip } from "../lib/jobs";
import { getSupabase } from "../lib/supabase";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing shot id" }, { status: 400 });
  }

  const db = getSupabase();
  const { data: shot, error } = await db
    .from("shots")
    .select("id, status, clip_status, job_id, image_url")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!shot) {
    return Response.json({ error: "Shot not found" }, { status: 404 });
  }
  if (shot.status !== "ready" || !shot.image_url) {
    return Response.json(
      { error: "Image must be ready before generating a clip" },
      { status: 409 },
    );
  }
  if (shot.clip_status === "generating") {
    return Response.json({ error: "Clip is already generating" }, { status: 409 });
  }

  await db
    .from("shots")
    .update({
      clip_status: "generating",
      clip_error: null,
      clip_started_at: new Date().toISOString(),
    })
    .eq("id", id);

  void generateClip(id).catch((err) => {
    console.error(`generateClip(${id}) threw:`, err);
  });

  return Response.json({ shotId: id, jobId: shot.job_id });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
