import type { Route } from "./+types/api.assets.$id";
import { requireUserApi } from "../lib/auth";
import { deleteUserAsset } from "../lib/studio/db";

// DELETE /api/assets/:id → { ok }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  try {
    const ok = params.id ? await deleteUserAsset(user.id, params.id) : false;
    if (!ok) return Response.json({ error: "Asset not found" }, { status: 404, headers });
    return Response.json({ ok: true }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use DELETE" }, { status: 405 });
}
