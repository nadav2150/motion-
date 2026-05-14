import { getSupabase } from "./supabase";

export const STORYBOARDS_BUCKET = "storyboards";

let bucketReady = false;
let bucketWarningLogged = false;

/**
 * Best-effort bucket existence check. NEVER throws.
 *
 * Many Supabase projects keep RLS enabled on `storage.buckets` even for the
 * service-role key, so both `getBucket` and `createBucket` may return RLS
 * errors even when the bucket already exists and is writable via
 * `storage.objects`. We log a one-time warning in that case and let the
 * caller proceed — `uploadBuffer` will catch the real error if uploads
 * actually fail, with a more helpful message that includes the upload path.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const db = getSupabase();

  // Fast path: bucket exists and is readable with our key.
  const { data: existing } = await db.storage.getBucket(STORYBOARDS_BUCKET);
  if (existing) {
    bucketReady = true;
    return;
  }

  // Try to create. If it already exists, great. If RLS blocks the create,
  // assume the bucket may already exist and was just unreadable; proceed
  // and let the actual upload tell us if it doesn't.
  const { error: createErr } = await db.storage.createBucket(STORYBOARDS_BUCKET, {
    public: true,
    fileSizeLimit: 25 * 1024 * 1024,
  });

  if (!createErr || /already exists/i.test(createErr.message)) {
    bucketReady = true;
    return;
  }

  if (!bucketWarningLogged) {
    bucketWarningLogged = true;
    console.warn(
      `[storage] Could not verify or create bucket "${STORYBOARDS_BUCKET}" via the storage admin API (RLS on storage.buckets). ` +
        `Assuming the bucket exists and is writable. If uploads fail, create the bucket manually in ` +
        `Supabase Dashboard → Storage → New bucket: name="${STORYBOARDS_BUCKET}", public=true, file size limit=25 MB. ` +
        `Original error: ${createErr.message}`,
    );
  }
  // Mark ready so we don't re-issue the same call on every upload.
  bucketReady = true;
}

function extFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(jpe?g|png|webp|mp4|mov|webm)$/i);
    if (match) return match[1]!.toLowerCase().replace("jpeg", "jpg");
  } catch {
    // fall through
  }
  return fallback;
}

function contentTypeFromExt(ext: string): string {
  switch (ext) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    default: return "image/jpeg";
  }
}

export type MirroredAsset = {
  storagePath: string;
  publicUrl: string;
};

async function mirrorAsset(
  storagePath: string,
  sourceUrl: string,
  fallbackExt: string,
): Promise<MirroredAsset> {
  await ensureBucket();

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Mirror fetch failed (${res.status}) for ${sourceUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const ext = extFromUrl(sourceUrl, fallbackExt);
  const finalPath = storagePath.endsWith(`.${ext}`) ? storagePath : `${storagePath}.${ext}`;
  const contentType = res.headers.get("content-type") ?? contentTypeFromExt(ext);

  const db = getSupabase();
  const { error: uploadErr } = await db.storage
    .from(STORYBOARDS_BUCKET)
    .upload(finalPath, buffer, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
  if (uploadErr) {
    throw new Error(`Mirror upload failed: ${uploadErr.message}`);
  }

  const { data: publicData } = db.storage
    .from(STORYBOARDS_BUCKET)
    .getPublicUrl(finalPath);
  return { storagePath: finalPath, publicUrl: publicData.publicUrl };
}

export async function mirrorImage(
  jobId: string,
  shotIndex: number,
  sourceUrl: string,
): Promise<MirroredAsset> {
  return mirrorAsset(
    `jobs/${jobId}/${String(shotIndex).padStart(2, "0")}`,
    sourceUrl,
    "jpg",
  );
}

export async function mirrorVideo(
  jobId: string,
  shotIndex: number,
  sourceUrl: string,
): Promise<MirroredAsset> {
  return mirrorAsset(
    `jobs/${jobId}/${String(shotIndex).padStart(2, "0")}_clip`,
    sourceUrl,
    "mp4",
  );
}

// ─── HyperFrames helpers ─────────────────────────────────────────────────
// Upload local Buffers (not mirror from a remote URL).

export async function uploadBuffer(args: {
  storagePath: string;
  body: Buffer;
  contentType: string;
}): Promise<MirroredAsset> {
  await ensureBucket();
  const db = getSupabase();
  const { error } = await db.storage
    .from(STORYBOARDS_BUCKET)
    .upload(args.storagePath, args.body, {
      contentType: args.contentType,
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) {
    // Bucket-not-found / RLS on bucket → tell the user exactly how to fix it.
    if (/bucket.*not.*found|no such bucket/i.test(error.message)) {
      throw new Error(
        `uploadBuffer(${args.storagePath}) failed: bucket "${STORYBOARDS_BUCKET}" does not exist. ` +
          `Create it in Supabase Dashboard → Storage → New bucket: name="${STORYBOARDS_BUCKET}", ` +
          `public=true, file size limit=25 MB. Original error: ${error.message}`,
      );
    }
    if (/row-level security|rls|not allowed|forbidden|permission/i.test(error.message)) {
      throw new Error(
        `uploadBuffer(${args.storagePath}) blocked by RLS on storage.objects. ` +
          `Add a service-role policy in Supabase → SQL Editor:\n` +
          `  create policy "service_role full access on storyboards"\n` +
          `    on storage.objects for all to service_role\n` +
          `    using (bucket_id = '${STORYBOARDS_BUCKET}')\n` +
          `    with check (bucket_id = '${STORYBOARDS_BUCKET}');\n` +
          `Original error: ${error.message}`,
      );
    }
    throw new Error(`uploadBuffer(${args.storagePath}) failed: ${error.message}`);
  }
  const { data } = db.storage
    .from(STORYBOARDS_BUCKET)
    .getPublicUrl(args.storagePath);
  return { storagePath: args.storagePath, publicUrl: data.publicUrl };
}

export async function uploadSceneAsset(args: {
  jobId: string;
  sceneId: string;
  filename: string;
  body: Buffer;
  contentType: string;
}): Promise<MirroredAsset> {
  const path = `jobs/${args.jobId}/scenes/${args.sceneId}/${args.filename}`;
  return uploadBuffer({ storagePath: path, body: args.body, contentType: args.contentType });
}

export async function uploadRenderedScene(args: {
  jobId: string;
  sceneId: string;
  mp4: Buffer;
}): Promise<MirroredAsset> {
  return uploadSceneAsset({
    jobId: args.jobId,
    sceneId: args.sceneId,
    filename: "scene.mp4",
    body: args.mp4,
    contentType: "video/mp4",
  });
}

export async function uploadFinalVideo(args: {
  jobId: string;
  mp4: Buffer;
}): Promise<MirroredAsset> {
  return uploadBuffer({
    storagePath: `jobs/${args.jobId}/final.mp4`,
    body: args.mp4,
    contentType: "video/mp4",
  });
}

// Supabase Storage has no native recursive delete — list the prefix and
// remove() the paths it returns. We descend into subfolders (scenes/<id>/...)
// so nothing is left behind. Best-effort: a partial failure is logged, not
// thrown, since the caller has already removed the DB row.
async function listAllPaths(prefix: string): Promise<string[]> {
  const db = getSupabase();
  const collected: string[] = [];
  const stack: string[] = [prefix];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    const { data, error } = await db.storage
      .from(STORYBOARDS_BUCKET)
      .list(dir, { limit: 1000 });
    if (error) {
      console.warn(`[storage] list("${dir}") failed: ${error.message}`);
      continue;
    }
    for (const entry of data ?? []) {
      const full = `${dir}/${entry.name}`;
      // Folders come back with id === null and no metadata.
      if (entry.id === null && !entry.metadata) {
        stack.push(full);
      } else {
        collected.push(full);
      }
    }
  }
  return collected;
}

export async function removeJobAssets(jobId: string): Promise<number> {
  const paths = await listAllPaths(`jobs/${jobId}`);
  if (paths.length === 0) return 0;

  const db = getSupabase();
  const { data, error } = await db.storage
    .from(STORYBOARDS_BUCKET)
    .remove(paths);
  if (error) {
    console.warn(
      `[storage] removeJobAssets(${jobId}) partial failure: ${error.message} ` +
        `(attempted ${paths.length} object(s))`,
    );
    return 0;
  }
  return data?.length ?? paths.length;
}
