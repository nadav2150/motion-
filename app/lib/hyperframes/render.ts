// HyperFrames renderer. Writes scene files to a temp dir, runs
// `npx hyperframes render index.html --output scene.mp4` via spawn,
// uploads the MP4 to Supabase.
//
// Scene files (index.html, style.css, animation.js) are also uploaded
// so a scene can be re-rendered or inspected without re-emitting.

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  uploadRenderedScene,
  uploadSceneAsset,
  type MirroredAsset,
} from "../storage";
import type { SceneFiles } from "./types";

export type RenderSceneArgs = {
  jobId: string;
  sceneId: string;
  files: SceneFiles;
  /** Cleanup the temp dir after upload. Default true. */
  cleanup?: boolean;
};

export type RenderSceneResult = {
  mp4: MirroredAsset;
  htmlPath: string;
  cssPath: string;
  jsPath: string;
  durationMs: number;
};

export async function renderScene(args: RenderSceneArgs): Promise<RenderSceneResult> {
  const startedAt = Date.now();
  const dir = path.join(tmpdir(), "motionglass", args.jobId, args.sceneId);
  await mkdir(dir, { recursive: true });

  const htmlFile = path.join(dir, "index.html");
  const cssFile = path.join(dir, "style.css");
  const jsFile = path.join(dir, "animation.js");

  await Promise.all([
    writeFile(htmlFile, args.files.html, "utf8"),
    writeFile(cssFile, args.files.css, "utf8"),
    writeFile(jsFile, args.files.js, "utf8"),
  ]);

  // Upload the source files so they're inspectable without re-emit.
  const [htmlMirror, cssMirror, jsMirror] = await Promise.all([
    uploadSceneAsset({
      jobId: args.jobId,
      sceneId: args.sceneId,
      filename: "index.html",
      body: Buffer.from(args.files.html, "utf8"),
      contentType: "text/html; charset=utf-8",
    }),
    uploadSceneAsset({
      jobId: args.jobId,
      sceneId: args.sceneId,
      filename: "style.css",
      body: Buffer.from(args.files.css, "utf8"),
      contentType: "text/css; charset=utf-8",
    }),
    uploadSceneAsset({
      jobId: args.jobId,
      sceneId: args.sceneId,
      filename: "animation.js",
      body: Buffer.from(args.files.js, "utf8"),
      contentType: "application/javascript; charset=utf-8",
    }),
  ]);

  // Run `npx hyperframes render . --output scene.mp4` in the temp dir.
  // HyperFrames' first positional arg is a project directory; `"."`
  // (the cwd) is the scene dir with index.html, style.css, animation.js.
  // Use shell=true on win32 since `npx` is a .cmd shim there.
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";
  const args2 = ["hyperframes", "render", ".", "--output", "scene.mp4"];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args2, {
      cwd: dir,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (d) => {
      process.stdout.write(`[hyperframes ${args.sceneId}] ${d}`);
    });
    child.stderr?.on("data", (d) => {
      stderrChunks.push(Buffer.from(d));
      process.stderr.write(`[hyperframes ${args.sceneId}] ${d}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `hyperframes render exited ${code} for ${args.sceneId}:\n${Buffer.concat(stderrChunks).toString("utf8").slice(-2000)}`,
          ),
        );
    });
  });

  const mp4File = path.join(dir, "scene.mp4");
  const mp4Buffer = await readFile(mp4File);
  const mp4 = await uploadRenderedScene({
    jobId: args.jobId,
    sceneId: args.sceneId,
    mp4: mp4Buffer,
  });

  if (args.cleanup !== false) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    mp4,
    htmlPath: htmlMirror.storagePath,
    cssPath: cssMirror.storagePath,
    jsPath: jsMirror.storagePath,
    durationMs: Date.now() - startedAt,
  };
}
