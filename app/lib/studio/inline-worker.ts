// STUDIO_INLINE_WORKER=1: run the task worker inside the web process, so a
// single `npm run dev:local` still processes videos without `npm run worker`.
// Off by default — in-process work dies with every dev-server restart, which
// is exactly what the separate worker process exists to avoid.
//
// Started lazily (first enqueue, first job poll, or a worker ping) and guarded
// on globalThis so Vite's module re-evaluation never starts a second loop.
// stopInlineWorker() exists for tests.

const KEY = Symbol.for("videly.studio.inlineWorker");
type Holder = { controller: AbortController; done: Promise<unknown> };

export function inlineWorkerEnabled(): boolean {
  return process.env.STUDIO_INLINE_WORKER === "1";
}

export function inlineWorkerRunning(): boolean {
  return !!(globalThis as Record<symbol, unknown>)[KEY];
}

export function ensureInlineWorker(): void {
  if (!inlineWorkerEnabled()) return;
  const g = globalThis as Record<symbol, Holder | undefined>;
  if (g[KEY]) return;
  const controller = new AbortController();
  const holder: Holder = { controller, done: Promise.resolve() };
  g[KEY] = holder;
  holder.done = import("./worker")
    .then(({ runWorker }) => runWorker({ signal: controller.signal, workerId: `inline:${process.pid}` }))
    .catch((err) => console.error("[studio inline worker] crashed:", err instanceof Error ? err.message : err))
    .finally(() => {
      if (g[KEY] === holder) g[KEY] = undefined;
    });
  // No signal handlers here: adding one would swallow Ctrl-C / SIGTERM for the
  // web server. When the process dies its tasks' heartbeats go stale and they
  // are resumed by the next worker.
  console.log("[studio inline worker] started in the web process (STUDIO_INLINE_WORKER=1)");
}

export async function stopInlineWorker(): Promise<void> {
  const g = globalThis as Record<symbol, Holder | undefined>;
  const holder = g[KEY];
  if (!holder) return;
  holder.controller.abort();
  await holder.done;
}
