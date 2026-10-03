// Public share links (/v/:slug) — server-side helpers. Admin-created; see
// supabase/migrations/20261003_shared_videos.sql.

import { getSupabase } from "./supabase";
import { SITE_URL } from "./seo";
import { publicUrl } from "./studio/db";

export type SharedVideoRow = {
  id: string;
  slug: string;
  title: string;
  recipient: string | null;
  message: string | null;
  job_id: string | null;
  video_path: string;
  thumb_path: string | null;
  views: number;
  downloads: number;
  created_by: string | null;
  created_at: string;
  disabled_at: string | null;
};

// Appended to every copied link so signups from the page are attributed
// (first-touch capture in app/lib/attribution.ts).
export const SHARE_UTM = "utm_source=reddit&utm_medium=comment&utm_campaign=giveaway";

export function shareUrl(slug: string): string {
  return `${SITE_URL}/v/${slug}?${SHARE_UTM}`;
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** A free slug derived from `base`; adds a short random suffix when taken. */
export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "video";
  const db = getSupabase();
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 && root.length >= 2 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await db.from("shared_videos").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createSharedVideo(input: {
  title: string;
  recipient?: string | null;
  message?: string | null;
  slug?: string | null;
  jobId?: string | null;
  videoPath: string;
  thumbPath?: string | null;
  createdBy: string;
}): Promise<SharedVideoRow> {
  const slug = input.slug ? await uniqueSlug(input.slug) : await uniqueSlug(input.recipient || input.title);
  const { data, error } = await getSupabase()
    .from("shared_videos")
    .insert({
      slug,
      title: input.title,
      recipient: input.recipient || null,
      message: input.message || null,
      job_id: input.jobId ?? null,
      video_path: input.videoPath,
      thumb_path: input.thumbPath ?? null,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createSharedVideo failed: ${error.message}`);
  return data as SharedVideoRow;
}

export async function getSharedVideo(slug: string): Promise<SharedVideoRow | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) return null;
  const { data, error } = await getSupabase()
    .from("shared_videos")
    .select("*")
    .eq("slug", slug)
    .is("disabled_at", null)
    .maybeSingle();
  if (error) throw new Error(`getSharedVideo(${slug}) failed: ${error.message}`);
  return (data as SharedVideoRow | null) ?? null;
}

export async function listSharedVideos(): Promise<SharedVideoRow[]> {
  const { data, error } = await getSupabase()
    .from("shared_videos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listSharedVideos failed: ${error.message}`);
  return (data ?? []) as SharedVideoRow[];
}

export async function setSharedVideoDisabled(id: string, disabled: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("shared_videos")
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(`setSharedVideoDisabled failed: ${error.message}`);
}

/** Best-effort counter bump; never throws. */
export async function bumpSharedVideo(slug: string, field: "views" | "downloads"): Promise<void> {
  const { error } = await getSupabase().rpc("shared_video_bump", { p_slug: slug, p_field: field });
  if (error) console.warn(`[share] bump ${field} for ${slug} failed: ${error.message}`);
}

export function sharedVideoUrls(row: SharedVideoRow) {
  return { videoUrl: publicUrl(row.video_path)!, thumbUrl: publicUrl(row.thumb_path) };
}

export function shareDownloadFilename(row: SharedVideoRow): string {
  return `${slugify(row.title) || row.slug}-videly.mp4`;
}
