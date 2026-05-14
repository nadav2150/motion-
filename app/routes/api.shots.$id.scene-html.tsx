import type { Route } from "./+types/api.shots.$id.scene-html";
import { getSupabase } from "../lib/supabase";
import { STORYBOARDS_BUCKET } from "../lib/storage";

// Returns the scene's index.html for the editor iframe to srcDoc-inject.
// Handles both shapes of scene_html_path:
//   - a Supabase public URL (newer rows)
//   - a bucket-relative storage path like "jobs/<jobId>/scenes/<sceneId>/index.html"
//     (legacy rows broken by the pre-fix export overwrite)
//
// Going through this route also bypasses any Content-Type / Content-Disposition
// quirks Supabase may apply to public URLs.
export async function loader({ params }: Route.LoaderArgs) {
  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing shot id" }, { status: 400 });
  }

  const db = getSupabase();
  const { data: shot, error } = await db
    .from("shots")
    .select("scene_html_path")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!shot?.scene_html_path) {
    return Response.json({ error: "Scene HTML not generated yet" }, { status: 404 });
  }

  const path: string = shot.scene_html_path;

  try {
    let html: string;
    if (/^https?:\/\//i.test(path)) {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      html = await res.text();
    } else {
      // Treat as bucket-relative storage path.
      const { data, error: dlErr } = await db.storage
        .from(STORYBOARDS_BUCKET)
        .download(path);
      if (dlErr || !data) {
        throw new Error(`storage download failed: ${dlErr?.message ?? "no data"}`);
      }
      html = await data.text();
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
