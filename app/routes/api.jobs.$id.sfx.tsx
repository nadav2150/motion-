import type { Route } from "./+types/api.jobs.$id.sfx";
import { updateJobSfx } from "../lib/jobs";
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
      await updateJobSfx(id, user.id, null);
      return Response.json({ ok: true, sfx: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "Project not found" ? 404 : 500;
      console.error(`/api/jobs/${id}/sfx DELETE failed:`, message);
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
    sfxId?: unknown;
    name?: unknown;
    author?: unknown;
    previewUrl?: unknown;
    license?: unknown;
  };

  if (
    typeof b.sfxId !== "string" ||
    !b.sfxId.trim() ||
    typeof b.name !== "string" ||
    typeof b.author !== "string" ||
    typeof b.previewUrl !== "string" ||
    !b.previewUrl.trim() ||
    typeof b.license !== "string"
  ) {
    return Response.json(
      { error: "sfxId, name, author, previewUrl, license (strings) are required" },
      { status: 400 },
    );
  }

  try {
    const sfx = {
      sfxId: b.sfxId.trim(),
      name: b.name,
      author: b.author,
      previewUrl: b.previewUrl.trim(),
      license: b.license,
    };
    await updateJobSfx(id, user.id, sfx);
    return Response.json({ ok: true, sfx });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Project not found" ? 404 : 500;
    console.error(`/api/jobs/${id}/sfx POST failed:`, message);
    return Response.json({ error: message }, { status });
  }
}
