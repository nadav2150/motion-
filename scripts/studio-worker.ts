// Studio task worker process: claims studio_tasks and runs generate /
// regenerate / edit / render (app/lib/studio/worker.ts).
//
//   npm run worker                      dev (tsx, reads .env)
//   node build/worker/studio-worker.mjs production (started by the supervisor)
//
// Env: STUDIO_WORKER_CONCURRENCY (default 3 generate/edit/regenerate at once),
// STUDIO_WORKER_KINDS (comma list, default all), STUDIO_WORKER_ID.
// SIGTERM / SIGINT: stop claiming, let running tasks finish for up to 60 s,
// hand the rest back to the queue, exit. A second signal exits immediately.

import "./studio-worker-env";
import { shutdownBrowser } from "../app/lib/studio/browser";
import { STUDIO_TASK_KINDS, type StudioTaskKind } from "../app/lib/studio/queue";
import { runWorker } from "../app/lib/studio/worker";

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), scope: "studio-worker", event, ...fields }));
}

const controller = new AbortController();
let signals = 0;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    signals++;
    if (signals === 1) {
      log("signal", { signal: sig, action: "graceful shutdown" });
      controller.abort();
    } else {
      log("signal", { signal: sig, action: "exit now" });
      process.exit(1);
    }
  });
}
// One bad task must not take the whole worker down.
process.on("unhandledRejection", (reason) => {
  log("unhandled_rejection", { error: reason instanceof Error ? reason.message : String(reason) });
});

const kinds = (process.env.STUDIO_WORKER_KINDS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter((k): k is StudioTaskKind => (STUDIO_TASK_KINDS as string[]).includes(k));

runWorker({
  concurrency: Number(process.env.STUDIO_WORKER_CONCURRENCY) || 3,
  kinds: kinds.length ? kinds : undefined,
  workerId: process.env.STUDIO_WORKER_ID || undefined,
  signal: controller.signal,
})
  .then(async () => {
    await shutdownBrowser();
    process.exit(0);
  })
  .catch(async (err) => {
    log("worker_crashed", { error: err instanceof Error ? err.stack ?? err.message : String(err) });
    await shutdownBrowser().catch(() => {});
    process.exit(1);
  });
