import type { Route } from "./+types/api.reference-video";
import { requireUserApi } from "../lib/auth";
import { uploadBuffer } from "../lib/storage";

// Cloudflare caps request bodies at 100 MB on the Worker in front of the
// container, so larger clips have to come in as a link instead.
const MAX_REFERENCE_BYTES = 95 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/mpeg": "mpeg",
};

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400, headers });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400, headers });
  }
  if (file.size === 0) {
    return Response.json({ error: "Empty file" }, { status: 400, headers });
  }
  if (file.size > MAX_REFERENCE_BYTES) {
    return Response.json(
      { error: `Reference video must be ≤ ${Math.floor(MAX_REFERENCE_BYTES / 1024 / 1024)} MB — paste a link for larger clips.` },
      { status: 413, headers },
    );
  }

  const contentType = (file.type || "").toLowerCase();
  const ext = EXT_BY_MIME[contentType];
  if (!ext) {
    return Response.json(
      { error: "Upload an MP4, MOV, WEBM or M4V video." },
      { status: 415, headers },
    );
  }

  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `reference/${user.id}/${stamp}-${rand}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { publicUrl, storagePath: finalPath } = await uploadBuffer({
      storagePath,
      body: buffer,
      contentType,
    });
    return Response.json(
      { referenceVideoUrl: publicUrl, storagePath: finalPath, name: file.name },
      { headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/reference-video POST failed:", message);
    return Response.json({ error: message }, { status: 500, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
