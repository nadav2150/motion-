import type { Route } from "./+types/api.studio.templates.$id.use";
import { requireUserApi } from "../lib/auth";
import { getStudioJob } from "../lib/studio/db";
import { duplicateStudioJob } from "../lib/studio/generate";
import { getTemplate, templateSourceJob } from "../lib/studio/templates";

// POST /api/studio/templates/:id/use → 201 { id }
// Copies the template's showcase video into the caller's account (free, like
// duplicating) so it opens in the editor. 404 when the template has no source
// video; the client then falls back to pre-filling the prompt.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  const template = getTemplate(params.id);
  const sourceId = template ? templateSourceJob(template.id) : null;
  const source = sourceId ? await getStudioJob(sourceId) : null;
  if (!template || !source || source.generation_mode !== "v2" || !(source.current_revision ?? 0)) {
    return Response.json({ error: "This template has no editable example" }, { status: 404, headers });
  }
  try {
    const id = await duplicateStudioJob(source, user.id, { title: source.title ?? template.name });
    return Response.json({ id }, { status: 201, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`/api/studio/templates/${template.id}/use failed:`, message);
    return Response.json({ error: "Could not open this template. Try again." }, { status: 500, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
