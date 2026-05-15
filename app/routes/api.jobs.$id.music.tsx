import type { Route } from "./+types/api.jobs.$id.music";
import { updateJobMusic } from "../lib/jobs";
import { getUserFromRequest } from "../lib/auth";

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (request.method === "DELETE") {
    try {
      await updateJobMusic(id, user.id, null);
      return Response.json({ ok: true, music: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "Project not found" ? 404 : 500;
      console.error(`/api/jobs/${id}/music DELETE failed:`, message);
      return Response.json({ error: message }, { status });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = (body ?? {}) as {
    trackId?: unknown;
    title?: unknown;
    artist?: unknown;
    streamUrl?: unknown;
  };

  if (
    typeof b.trackId !== "string" ||
    !b.trackId.trim() ||
    typeof b.title !== "string" ||
    typeof b.artist !== "string" ||
    typeof b.streamUrl !== "string" ||
    !b.streamUrl.trim()
  ) {
    return Response.json(
      { error: "trackId, title, artist, streamUrl (strings) are required" },
      { status: 400 },
    );
  }

  try {
    const music = {
      trackId: b.trackId.trim(),
      title: b.title,
      artist: b.artist,
      streamUrl: b.streamUrl.trim(),
    };
    await updateJobMusic(id, user.id, music);
    return Response.json({ ok: true, music });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Project not found" ? 404 : 500;
    console.error(`/api/jobs/${id}/music POST failed:`, message);
    return Response.json({ error: message }, { status });
  }
}
