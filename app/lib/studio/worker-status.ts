// The task worker writes a small status file on every poll; the worker-ping
// route reads it back. Both processes run in the same container, so a file in
// the temp dir is enough.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { StudioTaskKind } from "./queue";

export type WorkerStatus = {
  workerId: string;
  pid: number;
  startedAt: string;
  lastPollAt: string;
  shuttingDown: boolean;
  running: { id: string; kind: StudioTaskKind; jobId: string; attempt: number; startedAt: string }[];
};

export function workerStatusFile(): string {
  return process.env.STUDIO_WORKER_STATUS_FILE || path.join(os.tmpdir(), "videly-studio-worker.json");
}

export function writeWorkerStatus(status: WorkerStatus): void {
  try {
    const file = workerStatusFile();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(status));
  } catch {
    // informational only
  }
}

/** alive = polled within the last 30 s. */
export function readWorkerStatus(now = Date.now()): (WorkerStatus & { alive: boolean }) | null {
  try {
    const status = JSON.parse(readFileSync(workerStatusFile(), "utf8")) as WorkerStatus;
    return { ...status, alive: now - new Date(status.lastPollAt).getTime() < 30_000 };
  } catch {
    return null;
  }
}
