import type { Route } from "./+types/api.jobs.$id";
import { deleteJob, getJob, updateJobBrand } from "../lib/jobs";
import { getUserFromRequest } from "../lib/auth";

export async function loader({ params }: Route.LoaderArgs) {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

  try {
    const result = await getJob(id);
    if (!result) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`/api/jobs/${id} GET failed:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (request.method === "DELETE") {
    try {
      await deleteJob(id, user.id);
      return Response.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "Project not found" ? 404 : 500;
      console.error(`/api/jobs/${id} DELETE failed:`, message);
      return Response.json({ error: message }, { status });
    }
  }

  if (request.method === "PATCH") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const b = (body ?? {}) as {
      brandLogoUrl?: unknown;
      brandLogoStoragePath?: unknown;
      brandColors?: unknown;
    };

    // Validate brand_colors as array of hex strings if present.
    let colors: string[] | null | undefined;
    if (b.brandColors === null) {
      colors = null;
    } else if (Array.isArray(b.brandColors)) {
      const cleaned = b.brandColors
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => /^#[0-9a-f]{6}$/.test(c));
      colors = cleaned;
    }

    try {
      await updateJobBrand(id, user.id, {
        brandLogoUrl:
          b.brandLogoUrl === null || typeof b.brandLogoUrl === "string"
            ? (b.brandLogoUrl as string | null)
            : undefined,
        brandLogoStoragePath:
          b.brandLogoStoragePath === null || typeof b.brandLogoStoragePath === "string"
            ? (b.brandLogoStoragePath as string | null)
            : undefined,
        brandColors: colors,
      });
      return Response.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "Project not found" ? 404 : 500;
      console.error(`/api/jobs/${id} PATCH failed:`, message);
      return Response.json({ error: message }, { status });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
