import type { Route } from "./+types/api.brand.logo";
import { getUserFromRequest } from "../lib/auth";
import { uploadBuffer } from "../lib/storage";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return Response.json(
      { error: `Logo must be ≤ ${MAX_LOGO_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const contentType = file.type || "image/png";
  const ext = EXT_BY_MIME[contentType] ?? "png";

  // Unique filename per upload so previous versions remain referenceable
  // by older jobs that still point at them.
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `brand/${user.id}/${stamp}-${rand}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { publicUrl, storagePath: finalPath } = await uploadBuffer({
      storagePath,
      body: buffer,
      contentType,
    });
    return Response.json({ logoUrl: publicUrl, storagePath: finalPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/brand/logo POST failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
