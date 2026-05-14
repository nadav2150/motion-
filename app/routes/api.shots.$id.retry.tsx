import type { Route } from "./+types/api.shots.$id.retry";
import { retryShot } from "../lib/jobs";
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
    .select("id, status, job_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!shot) {
    return Response.json({ error: "Shot not found" }, { status: 404 });
  }
  if (shot.status === "generating") {
    return Response.json({ error: "Shot is already generating" }, { status: 409 });
  }

  // Flip to generating synchronously so the client sees feedback immediately;
  // do the actual render in fire-and-forget. The client resumes polling and
  // will see the eventual ready/failed state.
  await db.from("shots").update({ status: "generating", error: null }).eq("id", id);

  void retryShot(id).catch((err) => {
    console.error(`retryShot(${id}) threw:`, err);
  });

  return Response.json({ shotId: id, jobId: shot.job_id });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
