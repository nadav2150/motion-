import type { Route } from "./+types/api.studio.videos.$id.duplicate";
import { requireUserApi } from "../lib/auth";
import { getOwnedStudioJob } from "../lib/studio/db";
import { duplicateStudioJob } from "../lib/studio/generate";

// POST /api/studio/videos/:id/duplicate → { id }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row) return Response.json({ error: "Video not found" }, { status: 404, headers });
  if (row.generation_mode !== "v2") {
    return Response.json({ error: "Only Studio videos can be duplicated" }, { status: 409, headers });
  }
  try {
    const id = await duplicateStudioJob(row, user.id);
    return Response.json({ id }, { status: 201, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`/api/studio/videos/${row.id}/duplicate failed:`, message);
    return Response.json({ error: message }, { status: 500, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
