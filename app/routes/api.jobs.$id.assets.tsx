import type { Route } from "./+types/api.jobs.$id.assets";
import { getUserFromRequest } from "../lib/auth";
import { uploadBuffer, STORYBOARDS_BUCKET } from "../lib/storage";
import { getSupabase } from "../lib/supabase";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per asset

type AssetKind = "video" | "image" | "audio" | "other";

type JobAsset = {
  id: string;
  kind: AssetKind;
  url: string;
  storage_path: string;
  name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
};

function kindFromMime(mime: string): AssetKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

function extFromMimeOrName(mime: string, name: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
  };
  if (map[mime]) return map[mime];
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  }
  return "bin";
}

function isAssetArray(v: unknown): v is JobAsset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { url?: unknown }).url === "string",
    )
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const jobId = params.id;
  if (!jobId) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getSupabase();
  const { data: job, error: fetchErr } = await db
    .from("jobs")
    .select("id, user_id, assets")
    .eq("id", jobId)
    .maybeSingle();
  if (fetchErr || !job) {
    return Response.json(
      { error: fetchErr?.message ?? "Job not found" },
      { status: 404 },
    );
  }
  if (job.user_id && job.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = isAssetArray(job.assets) ? job.assets : [];

  if (request.method === "POST") {
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
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: `Asset must be ≤ ${MAX_BYTES / 1024 / 1024} MB` },
        { status: 413 },
      );
    }

    const mime = file.type || "application/octet-stream";
    const kind = kindFromMime(mime);
    const ext = extFromMimeOrName(mime, file.name);
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const storagePath = `jobs/${jobId}/assets/${stamp}-${rand}.${ext}`;

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { publicUrl, storagePath: finalPath } = await uploadBuffer({
        storagePath,
        body: buffer,
        contentType: mime,
      });
      const asset: JobAsset = {
        id: `ast_${stamp}_${rand}`,
        kind,
        url: publicUrl,
        storage_path: finalPath,
        name: safeName || `asset.${ext}`,
        mime,
        size_bytes: file.size,
        created_at: new Date().toISOString(),
      };
      const updated = [...existing, asset];
      const { error: updErr } = await db
        .from("jobs")
        .update({ assets: updated })
        .eq("id", jobId);
      if (updErr) {
        return Response.json({ error: updErr.message }, { status: 500 });
      }
      return Response.json({ assets: updated, added: asset });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`/api/jobs/${jobId}/assets POST failed:`, message);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    if (!assetId) {
      return Response.json({ error: "assetId is required" }, { status: 400 });
    }
    const target = existing.find((a) => a.id === assetId);
    const updated = existing.filter((a) => a.id !== assetId);
    const { error: updErr } = await db
      .from("jobs")
      .update({ assets: updated })
      .eq("id", jobId);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }
    // Best-effort cleanup of the storage object — don't fail the request if
    // the remove() fails; the row no longer references it either way.
    if (target?.storage_path) {
      void db.storage
        .from(STORYBOARDS_BUCKET)
        .remove([target.storage_path])
        .catch((e) =>
          console.warn(
            `[assets] failed to delete object ${target.storage_path}:`,
            e instanceof Error ? e.message : String(e),
          ),
        );
    }
    return Response.json({ assets: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function loader({ params }: Route.LoaderArgs) {
  const jobId = params.id;
  if (!jobId) return Response.json({ error: "Missing job id" }, { status: 400 });
  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .select("assets")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "Job not found" },
      { status: 404 },
    );
  }
  const assets = isAssetArray(data.assets) ? data.assets : [];
  return Response.json({ assets });
}
