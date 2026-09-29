// Container process supervisor: runs the web server and the Studio task
// worker side by side (scripts/container-supervisor.ts is the entry, bundled to
// build/worker/supervisor.mjs and started by the Dockerfile CMD).
//
// Policy — restart in place, escalate only for the web server:
//   - worker dies  → restart it with backoff (1 s … 60 s), forever. The web
//     keeps serving; the new worker resumes the dead one's tasks once their
//     heartbeats go stale. Taking the whole container down for a worker crash
//     (e.g. Chromium OOM) would also cut off every user's page for nothing.
//   - web dies     → restart it with backoff too, but after 5 crashes within
//     5 minutes exit non-zero: something is persistently wrong, and a fresh
//     container (the Container DO starts one on the next request) is the
//     cleanest recovery. The worker is stopped gracefully first.
//   - SIGTERM / SIGINT → forward to both, wait for them (the worker needs up
//     to 60 s to let running tasks finish), SIGKILL stragglers after 75 s.

import { spawn, type ChildProcess } from "node:child_process";

export type RestartPolicy = {
  baseDelayMs: number;
  maxDelayMs: number;
  /** Give up (exit) after this many crashes within windowMs; Infinity = never. */
  maxCrashes: number;
  windowMs: number;
};

export const WEB_POLICY: RestartPolicy = { baseDelayMs: 1_000, maxDelayMs: 30_000, maxCrashes: 5, windowMs: 5 * 60_000 };
export const WORKER_POLICY: RestartPolicy = { baseDelayMs: 1_000, maxDelayMs: 60_000, maxCrashes: Infinity, windowMs: 5 * 60_000 };

/** Pure: given recent crash times (including the one just now), restart or give up. */
export function restartDecision(
  crashTimes: number[],
  now: number,
  policy: RestartPolicy,
): { action: "restart"; delayMs: number; recent: number } | { action: "give_up"; recent: number } {
  const recent = crashTimes.filter((t) => now - t <= policy.windowMs).length;
  if (recent >= policy.maxCrashes) return { action: "give_up", recent };
  const delayMs = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, recent - 1));
  return { action: "restart", delayMs, recent };
}

export type ChildSpec = { name: string; command: string; args: string[]; policy: RestartPolicy };

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), scope: "supervisor", event, ...fields }));
}

export function runSupervisor(specs: ChildSpec[], opts: { stopTimeoutMs?: number } = {}): void {
  const stopTimeoutMs = opts.stopTimeoutMs ?? 75_000;
  const procs = new Map<string, ChildProcess | null>();
  const crashes = new Map<string, number[]>();
  let stopping = false;

  const start = (spec: ChildSpec) => {
    if (stopping) return;
    const child = spawn(spec.command, spec.args, { stdio: "inherit", env: process.env });
    procs.set(spec.name, child);
    log("child_started", { child: spec.name, pid: child.pid });
    child.on("exit", (code, signal) => {
      procs.set(spec.name, null);
      if (stopping) {
        log("child_stopped", { child: spec.name, code, signal });
        maybeExit();
        return;
      }
      const now = Date.now();
      const times = [...(crashes.get(spec.name) ?? []), now].filter((t) => now - t <= spec.policy.windowMs);
      crashes.set(spec.name, times);
      const decision = restartDecision(times, now, spec.policy);
      log("child_exited", { child: spec.name, code, signal, ...decision });
      if (decision.action === "give_up") {
        shutdown("SIGTERM", 1);
        return;
      }
      setTimeout(() => start(spec), decision.delayMs);
    });
    child.on("error", (err) => log("child_error", { child: spec.name, error: err.message }));
  };

  let exitCode = 0;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  const maybeExit = () => {
    if ([...procs.values()].some((p) => p && p.exitCode === null && p.signalCode === null)) return;
    if (killTimer) clearTimeout(killTimer);
    log("supervisor_exit", { code: exitCode });
    process.exit(exitCode);
  };
  const shutdown = (signal: NodeJS.Signals, code = 0) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    log("supervisor_stopping", { signal, code });
    for (const p of procs.values()) if (p && p.exitCode === null) p.kill(signal);
    killTimer = setTimeout(() => {
      for (const [name, p] of procs) {
        if (p && p.exitCode === null && p.signalCode === null) {
          log("child_killed", { child: name });
          p.kill("SIGKILL");
        }
      }
      setTimeout(() => process.exit(exitCode), 2_000).unref();
    }, stopTimeoutMs);
    maybeExit();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  for (const spec of specs) start(spec);
}
