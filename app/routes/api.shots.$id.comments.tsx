import type { Route } from "./+types/api.shots.$id.comments";
import { getSupabase } from "../lib/supabase";
import { getUserFromRequest } from "../lib/auth";

type SceneComment = {
  id: string;
  text: string;
  created_at: string;
  author: string | null;
};

function isCommentArray(v: unknown): v is SceneComment[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        typeof (c as { text?: unknown }).text === "string" &&
        typeof (c as { created_at?: unknown }).created_at === "string",
    )
  );
}

// POST adds a comment to the shot. DELETE with ?commentId=... removes one.
// Both return the full updated `comments` array so the client can rehydrate.
export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing shot id" }, { status: 400 });
  }

  const db = getSupabase();
  const { data: shot, error: fetchErr } = await db
    .from("shots")
    .select("id, comments")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !shot) {
    return Response.json(
      { error: fetchErr?.message ?? "Shot not found" },
      { status: 404 },
    );
  }

  const existing = isCommentArray(shot.comments) ? shot.comments : [];
  const user = await getUserFromRequest(request);
  const author = user?.email ?? null;

  if (request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const text =
      body && typeof (body as { text?: unknown }).text === "string"
        ? ((body as { text: string }).text).trim()
        : "";
    if (!text) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    const next: SceneComment = {
      id: `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text: text.slice(0, 2000),
      created_at: new Date().toISOString(),
      author,
    };
    const updated = [...existing, next];
    const { error: updErr } = await db
      .from("shots")
      .update({ comments: updated })
      .eq("id", id);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }
    return Response.json({ comments: updated });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const commentId = url.searchParams.get("commentId");
    if (!commentId) {
      return Response.json({ error: "commentId is required" }, { status: 400 });
    }
    const updated = existing.filter((c) => c.id !== commentId);
    const { error: updErr } = await db
      .from("shots")
      .update({ comments: updated })
      .eq("id", id);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }
    return Response.json({ comments: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function loader({ params }: Route.LoaderArgs) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing shot id" }, { status: 400 });
  const db = getSupabase();
  const { data, error } = await db
    .from("shots")
    .select("comments")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "Shot not found" },
      { status: 404 },
    );
  }
  const comments = isCommentArray(data.comments) ? data.comments : [];
  return Response.json({ comments });
}
