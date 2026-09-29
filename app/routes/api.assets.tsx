import type { Route } from "./+types/api.assets";
import { requireUserApi } from "../lib/auth";
import { uploadBuffer } from "../lib/storage";
import { assetKindForUpload, insertUserAsset, listUserAssets, probeUploadedMedia } from "../lib/studio/db";

// GET /api/assets?kind= → { items: UserAsset[] }
export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  const kind = new URL(request.url).searchParams.get("kind");
  try {
    const items = await listUserAssets(user.id, kind);
    return Response.json({ items }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500, headers });
  }
}

// POST /api/assets (multipart: file, optional kind=logo) → UserAsset
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
  if (!(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400, headers });
  const wanted = form.get("kind");
  const resolved = assetKindForUpload(file.type, file.size, typeof wanted === "string" ? wanted : null);
  if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status, headers });

  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `assets/${user.id}/${stamp}-${rand}.${resolved.ext}`;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const meta = await probeUploadedMedia(buffer, resolved.kind, resolved.ext);
    const { publicUrl } = await uploadBuffer({ storagePath, body: buffer, contentType: resolved.mime });
    const asset = await insertUserAsset({
      userId: user.id,
      kind: resolved.kind,
      name: (file.name || `${resolved.kind}.${resolved.ext}`).slice(0, 200),
      url: publicUrl,
      path: storagePath,
      mime: resolved.mime,
      bytes: file.size,
      ...meta,
      source: "upload",
    });
    return Response.json(asset, { status: 201, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/assets POST failed:", message);
    return Response.json({ error: message }, { status: 500, headers });
  }
}
