import { ensureInlineWorker, inlineWorkerEnabled, inlineWorkerRunning } from "../lib/studio/inline-worker";
import { timingSafeEqualString, WORKER_PING_HEADER, workerPingToken } from "../lib/studio/keepalive";
import { readWorkerStatus } from "../lib/studio/worker-status";

// GET /api/internal/worker-ping — hit every minute by the Worker's cron while
// Studio tasks are pending (src/worker.ts scheduled). Reaching the container
// at all is the point: it resets the container's sleepAfter timer. The body
// reports the task worker's status for debugging.
//
// Auth: header x-videly-worker-ping = HMAC(IMPERSONATION_SECRET, …) — see
// app/lib/studio/keepalive.ts. No DB work, so it stays cheap.
export async function loader({ request }: { request: Request }) {
  const secret = process.env.IMPERSONATION_SECRET;
  if (!secret) return Response.json({ error: "Not configured" }, { status: 503 });
  const given = request.headers.get(WORKER_PING_HEADER) ?? "";
  if (!timingSafeEqualString(given, await workerPingToken(secret))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  ensureInlineWorker();
  return Response.json({
    ok: true,
    worker: readWorkerStatus(),
    inline: { enabled: inlineWorkerEnabled(), running: inlineWorkerRunning() },
  });
}
