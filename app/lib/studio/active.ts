// Jobs whose generate / edit / render operation is running in THIS process.
//
// Studio operations run in-process (fire-and-forget from the API routes), so a
// deploy, crash or dev-server restart kills them mid-stage and the row stays
// "active" forever with its credits still reserved. reapInterruptedJob() runs
// on every poll of GET /api/jobs/:id: an active-looking job that this process
// is not running, and that has not been touched for a while, is marked failed
// and its reservation is settled (unused credits refunded). All requests reach
// one shared container instance (src/worker.ts), so a local registry is enough.

import { reconcileJob } from "../billing/credits";
import { getSupabase } from "../supabase";
import { IDLE_STAGES, setStage, stageOf, type StudioJobRow } from "./db";

// Kept on globalThis so a dev hot-reload (which re-evaluates this module while
// the old operations keep running) doesn't forget live jobs and reap them.
const globalRef = globalThis as typeof globalThis & { __videlyRunningJobs?: Set<string> };
const running: Set<string> = (globalRef.__videlyRunningJobs ??= new Set<string>());

export function markRunning(jobId: string): void {
  running.add(jobId);
}

export function markDone(jobId: string): void {
  running.delete(jobId);
}

export function isRunningHere(jobId: string): boolean {
  return running.has(jobId);
}

// Stages advance at least every few minutes (the longest single step is the
// streamed code call); anything older than this with no live operation is dead.
const STALE_AFTER_MS = 3 * 60_000;

export const INTERRUPTED_MESSAGE =
  "This video was interrupted by a server restart. Try again — unused credits were returned.";

/** Returns true when the row was reaped (the caller should re-read it). */
export async function reapInterruptedJob(row: StudioJobRow): Promise<boolean> {
  if (isRunningHere(row.id)) return false;
  const stage = stageOf(row);
  const renderingRevision = await hasActiveRender(row.id);
  if (IDLE_STAGES.includes(stage) && !renderingRevision) return false;
  const age = Date.now() - new Date(row.updated_at).getTime();
  if (!(age > STALE_AFTER_MS)) return false;

  if (!IDLE_STAGES.includes(stage)) {
    await setStage(row.id, "failed", { error: INTERRUPTED_MESSAGE });
  }
  if (renderingRevision) {
    await getSupabase()
      .from("job_revisions")
      .update({ render_status: "failed", render_error: INTERRUPTED_MESSAGE })
      .eq("job_id", row.id)
      .in("render_status", ["queued", "rendering"]);
  }
  await reconcileJob(row.id).catch((err) =>
    console.error(`[studio ${row.id}] reconcile after interruption failed:`, err instanceof Error ? err.message : err),
  );
  console.warn(`[studio ${row.id}] reaped interrupted job (stage=${stage}, idle ${Math.round(age / 1000)}s)`);
  return true;
}

async function hasActiveRender(jobId: string): Promise<boolean> {
  const { count } = await getSupabase()
    .from("job_revisions")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("render_status", ["queued", "rendering"]);
  return (count ?? 0) > 0;
}
