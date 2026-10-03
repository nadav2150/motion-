import type { Route } from "./+types/v.$slug.download";
import { getSupabase } from "../lib/supabase";
import { STORYBOARDS_BUCKET } from "../lib/storage";
import { bumpSharedVideo, getSharedVideo, shareDownloadFilename } from "../lib/share";

// GET /v/:slug/download → 302 to the MP4 (storage sets Content-Disposition). Public.
export async function loader({ params }: Route.LoaderArgs) {
  const row = params.slug ? await getSharedVideo(params.slug) : null;
  if (!row) return new Response("Not found", { status: 404 });
  await bumpSharedVideo(row.slug, "downloads");
  const { data } = getSupabase()
    .storage.from(STORYBOARDS_BUCKET)
    .getPublicUrl(row.video_path, { download: shareDownloadFilename(row) });
  return new Response(null, { status: 302, headers: { Location: data.publicUrl, "Cache-Control": "no-store" } });
}
