import type { Route } from "./+types/api.studio.videos.$id";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { isUuid } from "../lib/studio/db";

// PATCH /api/studio/videos/:id { title?, favorite? } → { ok }
// DELETE /api/studio/videos/:id → { ok } (soft delete: deleted_at)
// Works for every generation mode (My Videos lists them all).
export async function action({ request, params }: Route.ActionArgs) {
  const { user, headers } = await requireUserApi(request);
  const id = params.id;
  if (!id || !isUuid(id)) return Response.json({ error: "Video not found" }, { status: 404, headers });

  const db = getSupabase();
  const { data: row, error } = await db
    .from("jobs")
    .select("id, user_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500, headers });
  if (!row || row.user_id !== user.id || row.deleted_at) {
    return Response.json({ error: "Video not found" }, { status: 404, headers });
  }

  if (request.method === "PATCH") {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return Response.json({ error: "title must be a non-empty string" }, { status: 400, headers });
      }
      patch.title = body.title.trim().slice(0, 120);
    }
    if (body.favorite !== undefined) {
      if (typeof body.favorite !== "boolean") {
        return Response.json({ error: "favorite must be a boolean" }, { status: 400, headers });
      }
      patch.favorite = body.favorite;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 400, headers });
    }
    const { error: upErr } = await db.from("jobs").update(patch).eq("id", id).eq("user_id", user.id);
    if (upErr) return Response.json({ error: upErr.message }, { status: 500, headers });
    return Response.json({ ok: true }, { headers });
  }

  if (request.method === "DELETE") {
    const { error: delErr } = await db
      .from("jobs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500, headers });
    return Response.json({ ok: true }, { headers });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers });
}

export function loader() {
  return Response.json({ error: "Use PATCH or DELETE" }, { status: 405 });
}
