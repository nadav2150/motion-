import type { Route } from "./+types/api.shots.$id.assets";
import { getSupabase } from "../lib/supabase";

type SceneAsset = {
  id: string;
  kind: "video" | "image" | "screenshot" | "voiceover" | "sfx" | "music";
  url: string;
  name: string;
  created_at: string;
  // Optional reference back to the job-level library entry (so we can avoid
  // duplicating the same file across many scenes if the UX wants that later).
  source_asset_id?: string;
};

function isSceneAssetArray(v: unknown): v is SceneAsset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { kind?: unknown }).kind === "string" &&
        typeof (a as { url?: unknown }).url === "string",
    )
  );
}

const VALID_KINDS = new Set<SceneAsset["kind"]>([
  "video",
  "image",
  "screenshot",
  "voiceover",
  "sfx",
  "music",
]);

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing shot id" }, { status: 400 });
  }

  const db = getSupabase();
  const { data: shot, error: fetchErr } = await db
    .from("shots")
    .select("id, assets")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !shot) {
    return Response.json(
      { error: fetchErr?.message ?? "Shot not found" },
      { status: 404 },
    );
  }
  const existing = isSceneAssetArray(shot.assets) ? shot.assets : [];

  if (request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const b = body as Partial<SceneAsset>;
    const kind = b.kind && VALID_KINDS.has(b.kind) ? b.kind : null;
    const url = typeof b.url === "string" ? b.url.trim() : "";
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!kind || !url) {
      return Response.json(
        { error: "kind (valid) and url are required" },
        { status: 400 },
      );
    }
    const next: SceneAsset = {
      id: `sa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      url,
      name: name || url.split("/").pop() || "asset",
      created_at: new Date().toISOString(),
      source_asset_id:
        typeof b.source_asset_id === "string" ? b.source_asset_id : undefined,
    };
    const updated = [...existing, next];
    const { error: updErr } = await db
      .from("shots")
      .update({ assets: updated })
      .eq("id", id);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }
    return Response.json({ assets: updated, added: next });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    if (!assetId) {
      return Response.json({ error: "assetId is required" }, { status: 400 });
    }
    const updated = existing.filter((a) => a.id !== assetId);
    const { error: updErr } = await db
      .from("shots")
      .update({ assets: updated })
      .eq("id", id);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }
    return Response.json({ assets: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
