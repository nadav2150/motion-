// HyperFrames stitcher — concat per-scene MP4s into a final film.
//
// Scenes carry their own transitions (Tell 2 late-release + GSAP outros),
// so this is a plain concat — no xfade. Try `-c copy` first; fall back to
// `libx264 crf 20` re-encode if the streams aren't concat-compatible.

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { uploadFinalVideo } from "../storage";
import { getSupabase, type ShotRow } from "../supabase";

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

export async function stitchHyperframes(jobId: string): Promise<void> {
  const db = getSupabase();

  // Load shots ordered by shot_index. Only include those with a
  // rendered_video_url set.
  const { data: shotsData, error: shotsErr } = await db
    .from("shots")
    .select("id, shot_index, rendered_video_url")
    .eq("job_id", jobId)
    .order("shot_index", { ascending: true });

  if (shotsErr || !shotsData) {
    throw new Error(`stitchHyperframes load shots failed: ${shotsErr?.message}`);
  }

  const shots = (shotsData as Pick<ShotRow, "id" | "shot_index" | "rendered_video_url">[])
    .filter((s) => s.rendered_video_url);

  if (shots.length === 0) {
    throw new Error(`stitchHyperframes(${jobId}): no rendered scenes to stitch`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `motionglass-stitch-${jobId}-`));
  try {
    // Download each rendered scene to the work dir.
    const localPaths: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const localPath = path.join(workDir, `scene_${String(i).padStart(3, "0")}.mp4`);
      const res = await fetch(s.rendered_video_url!);
      if (!res.ok) {
        throw new Error(
          `stitch: failed to fetch scene ${s.id} (${res.status})`,
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(localPath, buf);
      localPaths.push(localPath);
    }

    // Write concat list. FFmpeg requires posix-style forward slashes on win32
    // when paths contain backslashes within a concat file.
    const concatList = localPaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    const concatFile = path.join(workDir, "concat.txt");
    await fs.writeFile(concatFile, concatList, "utf8");

    const finalPath = path.join(workDir, "final.mp4");

    // Try `-c copy` first.
    const copyOk = await tryFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFile,
      "-c",
      "copy",
      finalPath,
    ]);

    if (!copyOk) {
      // Re-encode fallback.
      const ok = await tryFfmpeg([
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatFile,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        finalPath,
      ]);
      if (!ok) {
        throw new Error(`ffmpeg re-encode also failed for job ${jobId}`);
      }
    }

    const finalBuf = await fs.readFile(finalPath);
    const uploaded = await uploadFinalVideo({ jobId, mp4: finalBuf });

    await db
      .from("jobs")
      .update({
        final_video_status: "ready",
        final_video_url: uploaded.publicUrl,
        final_video_storage_path: uploaded.storagePath,
        final_video_built_at: new Date().toISOString(),
        final_video_error: null,
      })
      .eq("id", jobId);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function tryFfmpeg(args: string[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stderrChunks: Buffer[] = [];
    child.stderr?.on("data", (d) => stderrChunks.push(Buffer.from(d)));
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0) {
        process.stderr.write(
          `[stitch] ffmpeg exit ${code}:\n${Buffer.concat(stderrChunks).toString("utf8").slice(-1500)}\n`,
        );
        resolve(false);
      } else resolve(true);
    });
  });
}
