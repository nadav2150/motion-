// Durable Studio task queue (studio_tasks, supabase/migrations/20260930_studio_tasks.sql).
//
// The API routes reserve credits, claim the job, then enqueue a task here; the
// worker process (./worker.ts) claims and runs it. Nothing in the web process
// runs a Studio operation any more (unless STUDIO_INLINE_WORKER=1).
//
//   enqueueStudioTask()        insert a queued task (one live task per job)
//   claimStudioTask()          claim_studio_task() RPC: queued or stale-running
//   heartbeatStudioTask()      heartbeat_studio_task() RPC (task + jobs.updated_at)
//   completeStudioTask()       → done
//   retryStudioTask()          → queued again after a backoff, keeps last_error
//   failStudioTask()           → failed (attempts exhausted)
//   releaseStudioTask()        graceful shutdown: hand the task back, attempt refunded
//   failExhaustedStudioTasks() fail_exhausted_studio_tasks() RPC
//   settleFailedTask()         what a finally-failed task does to its job + credits

import { reconcileJob } from "../billing/credits";
import { getSupabase } from "../supabase";
import { setStage, updateRevision } from "./db";
import type { ExportOptions, StudioStage } from "./types";

export type StudioTaskKind = "generate" | "regenerate" | "edit" | "render";
export type StudioTaskStatus = "queued" | "running" | "done" | "failed" | "canceled";

export const STUDIO_TASK_KINDS: StudioTaskKind[] = ["generate", "regenerate", "edit", "render"];

export type StudioTaskPayloads = {
  generate: Record<string, never>;
  regenerate: { restoreStage: StudioStage; expectedRevision: number };
  edit: { instruction: string; baseRevision: number | null; restoreStage: StudioStage; expectedRevision: number };
  render: { options: ExportOptions & { revision: number }; restoreStage: StudioStage };
};

export type StudioTaskRow<K extends StudioTaskKind = StudioTaskKind> = {
  id: string;
  job_id: string;
  kind: K;
  payload: StudioTaskPayloads[K];
  status: StudioTaskStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  worker_id: string | null;
  locked_at: string | null;
  heartbeat_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Worker heartbeat period. */
export const HEARTBEAT_MS = 15_000;
/** A running task whose heartbeat is older than this is presumed dead and re-claimable. */
export const STALE_SECONDS = 90;

export class StudioTaskConflictError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} already has a queued or running task`);
    this.name = "StudioTaskConflictError";
  }
}

// ─── Enqueue ───────────────────────────────────────────────────────────────

type EnqueueListener = (task: StudioTaskRow) => void;
const enqueueListeners = new Set<EnqueueListener>();

/** In-process workers (STUDIO_INLINE_WORKER=1, tests) subscribe to skip a poll interval. */
export function onStudioTaskEnqueued(listener: EnqueueListener): () => void {
  enqueueListeners.add(listener);
  return () => enqueueListeners.delete(listener);
}

/**
 * Which queue this process enqueues to and claims from. Local development and
 * production share one Supabase project, so they must not take each other's
 * tasks. STUDIO_QUEUE overrides; otherwise the production container
 * (NODE_ENV=production) is "prod" and everything else is "dev".
 */
export function studioQueue(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.STUDIO_QUEUE?.trim();
  if (explicit) return explicit;
  return env.NODE_ENV === "production" ? "prod" : "dev";
}

export async function enqueueStudioTask<K extends StudioTaskKind>(
  jobId: string,
  kind: K,
  payload: StudioTaskPayloads[K],
): Promise<StudioTaskRow<K>> {
  const { data, error } = await getSupabase()
    .from("studio_tasks")
    .insert({ job_id: jobId, kind, payload, queue: studioQueue() })
    .select("*")
    .single();
  if (error?.code === "23505") throw new StudioTaskConflictError(jobId);
  if (error || !data) throw new Error(`enqueueStudioTask(${jobId}, ${kind}) failed: ${error?.message ?? "no row"}`);
  const task = data as StudioTaskRow<K>;
  console.log(JSON.stringify({ msg: "studio_task_enqueued", task: task.id, job: jobId, kind }));
  for (const l of enqueueListeners) {
    try {
      l(task);
    } catch {
      // a listener never breaks an enqueue
    }
  }
  if (process.env.STUDIO_INLINE_WORKER === "1") {
    void import("./inline-worker").then((m) => m.ensureInlineWorker()).catch(() => {});
  }
  return task;
}

/**
 * For the edit / regenerate / render routes, which have already claimed the
 * job and reserved credits: enqueue, or undo both (restore the stage, settle
 * the reservation) and say which error to answer with.
 */
export async function enqueueClaimedOperation<K extends Exclude<StudioTaskKind, "generate">>(
  jobId: string,
  kind: K,
  payload: StudioTaskPayloads[K],
): Promise<{ ok: true; task: StudioTaskRow<K> } | { ok: false; status: 409 | 500; error: string }> {
  const restore = payload.restoreStage;
  try {
    return { ok: true, task: await enqueueStudioTask(jobId, kind, payload) };
  } catch (err) {
    const conflict = err instanceof StudioTaskConflictError;
    console.error(`[studio ${jobId}] enqueue ${kind} failed:`, err instanceof Error ? err.message : err);
    await setStage(jobId, restore).catch(() => {});
    await reconcileJob(jobId).catch((e) => console.error(`[studio ${jobId}] reconcile after failed enqueue failed:`, e));
    return conflict
      ? { ok: false, status: 409, error: "This video is busy — wait for the current step to finish." }
      : { ok: false, status: 500, error: "Could not start this step. Try again — your credits were returned." };
  }
}

// ─── Worker side ───────────────────────────────────────────────────────────

export async function claimStudioTask(
  workerId: string,
  kinds: StudioTaskKind[],
  staleSeconds = STALE_SECONDS,
): Promise<StudioTaskRow | null> {
  const { data, error } = await getSupabase().rpc("claim_studio_task", {
    p_worker: workerId,
    p_kinds: kinds,
    p_stale_seconds: staleSeconds,
    p_queue: studioQueue(),
  });
  if (error) throw new Error(`claim_studio_task failed: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as StudioTaskRow[];
  return rows[0] ?? null;
}

/** false when this worker no longer owns the task. */
export async function heartbeatStudioTask(taskId: string, workerId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("heartbeat_studio_task", { p_task: taskId, p_worker: workerId });
  if (error) throw new Error(`heartbeat_studio_task failed: ${error.message}`);
  return data === true;
}

async function updateOwnedTask(taskId: string, workerId: string | null, patch: Record<string, unknown>): Promise<boolean> {
  let q = getSupabase()
    .from("studio_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "running");
  if (workerId) q = q.eq("worker_id", workerId);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`studio_tasks update ${taskId} failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export function completeStudioTask(taskId: string, workerId: string): Promise<boolean> {
  return updateOwnedTask(taskId, workerId, { status: "done", last_error: null });
}

export function retryStudioTask(task: StudioTaskRow, workerId: string, error: string, delayMs: number): Promise<boolean> {
  return updateOwnedTask(task.id, workerId, {
    status: "queued",
    worker_id: null,
    last_error: error.slice(0, 2000),
    run_after: new Date(Date.now() + delayMs).toISOString(),
  });
}

/** Pass workerId = null to fail a task regardless of owner (the reaper). */
export function failStudioTask(taskId: string, workerId: string | null, error: string): Promise<boolean> {
  return updateOwnedTask(taskId, workerId, { status: "failed", last_error: error.slice(0, 2000) });
}

/**
 * Graceful shutdown ran out of time: requeue immediately and give the attempt
 * back — a deploy is not the task's fault. The work resumes from checkpoints.
 */
export function releaseStudioTask(task: StudioTaskRow, workerId: string): Promise<boolean> {
  return updateOwnedTask(task.id, workerId, {
    status: "queued",
    worker_id: null,
    attempts: Math.max(0, task.attempts - 1),
    last_error: "interrupted by worker shutdown",
    run_after: new Date().toISOString(),
  });
}

export async function failExhaustedStudioTasks(staleSeconds = STALE_SECONDS): Promise<StudioTaskRow[]> {
  const { data, error } = await getSupabase().rpc("fail_exhausted_studio_tasks", { p_stale_seconds: staleSeconds });
  if (error) throw new Error(`fail_exhausted_studio_tasks failed: ${error.message}`);
  return ((Array.isArray(data) ? data : data ? [data] : []) as StudioTaskRow[]);
}

/** Queued / running tasks of one job, newest first. */
export async function liveTasksForJob(jobId: string): Promise<StudioTaskRow[]> {
  const { data, error } = await getSupabase()
    .from("studio_tasks")
    .select("*")
    .eq("job_id", jobId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`liveTasksForJob(${jobId}) failed: ${error.message}`);
  return (data ?? []) as StudioTaskRow[];
}

export function heartbeatAgeMs(task: Pick<StudioTaskRow, "heartbeat_at" | "locked_at" | "created_at">, now = Date.now()): number {
  const at = task.heartbeat_at ?? task.locked_at ?? task.created_at;
  return now - new Date(at).getTime();
}

// ─── Final failure ─────────────────────────────────────────────────────────

/**
 * A task failed for good (attempts exhausted, timed out, or reaped): leave
 * the job in a usable state and settle its credits. A first generation fails
 * the video; edit / regenerate / render put the job back where it was (the
 * preview still works) with the error attached.
 */
export async function settleFailedTask(task: StudioTaskRow, message: string): Promise<void> {
  const jobId = task.job_id;
  const log = (step: string, err: unknown) =>
    console.error(`[studio ${jobId}] settle ${task.kind} task: ${step} failed:`, err instanceof Error ? err.message : err);
  const restore = (task.payload as { restoreStage?: StudioStage }).restoreStage ?? "preview_ready";

  if (task.kind === "render") {
    const revision = (task.payload as StudioTaskPayloads["render"]).options?.revision;
    if (typeof revision === "number") {
      await updateRevision(jobId, revision, { render_status: "failed", render_error: message.slice(0, 1000) }).catch((e) =>
        log("revision", e),
      );
    }
  }
  // Any render this operation left behind (the first generation renders too).
  await Promise.resolve(
    getSupabase()
      .from("job_revisions")
      .update({ render_status: "failed", render_error: message.slice(0, 1000) })
      .eq("job_id", jobId)
      .in("render_status", ["queued", "rendering"]),
  ).catch((e: unknown) => log("revisions", e));

  if (task.kind === "generate") {
    await setStage(jobId, "failed", { error: message, completed_at: new Date().toISOString() }).catch((e) => log("stage", e));
  } else if (task.kind === "render") {
    // Like a failed render in runStudioRender: the error lives on the revision.
    await setStage(jobId, restore).catch((e) => log("stage", e));
  } else {
    const prefix = task.kind === "edit" ? "Edit failed: " : "Regenerate failed: ";
    await setStage(jobId, restore, { error: `${prefix}${message}` }).catch((e) => log("stage", e));
  }
  await reconcileJob(jobId).catch((e) => log("reconcile", e));
}
