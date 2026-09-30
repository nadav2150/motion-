// Reaper for Studio jobs that look busy but will never finish.
//
// Operations run in the worker process from durable studio_tasks rows, so a
// restart no longer kills a video: its task's heartbeat goes stale and the
// next worker resumes it. reapInterruptedJob() runs on every poll of
// GET /api/jobs/:id and only fails a job when nothing will ever pick it up:
//
//   - the job looks active (non-idle stage, or a queued/rendering revision)
//     but has no queued/running task (created before the queue existed, the
//     task was deleted, or an operation left its stage behind), or
//   - its task is running with a stale heartbeat and no attempts left.
//
// Stale-but-retryable tasks are left alone — a worker will resume them.

import { reconcileJob } from "../billing/credits";
import { getSupabase } from "../supabase";
import { IDLE_STAGES, setStage, stageOf, type StudioJobRow } from "./db";
import { failStudioTask, heartbeatAgeMs, liveTasksForJob, settleFailedTask, STALE_SECONDS, type StudioTaskRow } from "./queue";
import type { StudioStage } from "./types";

export const INTERRUPTED_MESSAGE =
  "This video was interrupted by a server restart. Try again — unused credits were returned.";

// Between claiming the job and inserting its task the route holds no task;
// never reap inside that window.
export const NO_TASK_GRACE_MS = 30_000;

export type ReapDecision =
  | { action: "none" }
  | { action: "fail_orphan" }
  | { action: "fail_exhausted"; task: StudioTaskRow };

/** Pure decision (exported for tests). */
export function reapDecision(args: {
  stage: StudioStage;
  renderingRevision: boolean;
  tasks: StudioTaskRow[]; // queued / running tasks of the job
  updatedAt: string;
  now?: number;
}): ReapDecision {
  const now = args.now ?? Date.now();
  if (IDLE_STAGES.includes(args.stage) && !args.renderingRevision) return { action: "none" };
  if (args.tasks.length === 0) {
    const age = now - new Date(args.updatedAt).getTime();
    return age > NO_TASK_GRACE_MS ? { action: "fail_orphan" } : { action: "none" };
  }
  const exhausted = args.tasks.find(
    (t) =>
      t.attempts >= t.max_attempts &&
      (t.status === "queued" || (t.status === "running" && heartbeatAgeMs(t, now) > STALE_SECONDS * 1000)),
  );
  return exhausted ? { action: "fail_exhausted", task: exhausted } : { action: "none" };
}

/** Returns true when the row was reaped (the caller should re-read it). */
export async function reapInterruptedJob(row: StudioJobRow): Promise<boolean> {
  const stage = stageOf(row);
  const renderingRevision = await hasActiveRender(row.id);
  if (IDLE_STAGES.includes(stage) && !renderingRevision) return false;
  const tasks = await liveTasksForJob(row.id);
  const decision = reapDecision({ stage, renderingRevision, tasks, updatedAt: row.updated_at });

  if (decision.action === "fail_exhausted") {
    const t = decision.task;
    // Conditional on status = running: loses cleanly to a worker that just re-claimed it.
    const ok = await failStudioTask(t.id, null, "no attempts left (reaped)");
    if (!ok && t.status === "running") return false;
    if (!ok) {
      await getSupabase()
        .from("studio_tasks")
        .update({ status: "failed", last_error: "no attempts left (reaped)", updated_at: new Date().toISOString() })
        .eq("id", t.id)
        .eq("status", "queued");
    }
    await settleFailedTask(t, INTERRUPTED_MESSAGE);
    console.warn(`[studio ${row.id}] reaped job: ${t.kind} task ${t.id} used all ${t.attempts} attempts (stage=${stage})`);
    return true;
  }
  if (decision.action !== "fail_orphan") return false;

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
  console.warn(`[studio ${row.id}] reaped job with no live task (stage=${stage})`);
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
