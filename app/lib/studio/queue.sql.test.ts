// Runs supabase/migrations/20260930_studio_tasks.sql against PGlite (real
// Postgres compiled to WASM, single connection) and exercises the queue
// functions. What this cannot cover: concurrent claims from several
// connections (`for update skip locked` under contention) and Supabase's
// PostgREST / RLS layer.
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations/20260930_studio_tasks.sql"), "utf8");

let db: PGlite;

type Task = { id: string; job_id: string; kind: string; status: string; attempts: number; worker_id: string | null; last_error: string | null };

async function claim(worker: string, kinds: string[], stale = 90): Promise<Task | undefined> {
  const r = await db.query<Task>("select * from claim_studio_task($1, $2, $3)", [worker, kinds, stale]);
  return r.rows[0];
}

async function job(): Promise<string> {
  const r = await db.query<{ id: string }>("insert into jobs default values returning id");
  return r.rows[0]!.id;
}

async function enqueue(kind: string, over: Record<string, unknown> = {}): Promise<Task> {
  const jobId = (over.job_id as string | undefined) ?? (await job());
  const cols = ["job_id", "kind", ...Object.keys(over).filter((k) => k !== "job_id")];
  const vals = [jobId, kind, ...Object.entries(over).filter(([k]) => k !== "job_id").map(([, v]) => v)];
  const r = await db.query<Task>(
    `insert into studio_tasks (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    vals,
  );
  return r.rows[0]!;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table jobs (id uuid primary key default gen_random_uuid(), updated_at timestamptz not null default now() - interval '1 day');
  `);
  await db.exec(MIGRATION);
  // Idempotent: applying twice must not fail.
  await db.exec(MIGRATION);
}, 60_000);

beforeEach(async () => {
  await db.exec("delete from studio_tasks; delete from jobs;");
});

describe("studio_tasks migration", () => {
  it("claims the oldest queued task of the requested kinds and marks it running", async () => {
    const a = await enqueue("generate", { created_at: new Date(Date.now() - 60_000).toISOString() });
    await enqueue("generate");
    await enqueue("render", { created_at: new Date(Date.now() - 120_000).toISOString() });
    const t = await claim("w1", ["generate", "edit", "regenerate"]);
    expect(t).toMatchObject({ id: a.id, status: "running", attempts: 1, worker_id: "w1" });
    const r = await db.query<{ locked_at: string | null; heartbeat_at: string | null }>(
      "select locked_at, heartbeat_at from studio_tasks where id = $1",
      [a.id],
    );
    expect(r.rows[0]!.locked_at).not.toBeNull();
    expect(r.rows[0]!.heartbeat_at).not.toBeNull();
  });

  it("returns nothing when no task matches", async () => {
    await enqueue("render");
    expect(await claim("w1", ["generate"])).toBeUndefined();
  });

  it("does not claim a running task with a fresh heartbeat, but re-claims a stale one", async () => {
    const t = await enqueue("generate");
    await claim("w1", ["generate"]);
    expect(await claim("w2", ["generate"])).toBeUndefined();
    await db.query("update studio_tasks set heartbeat_at = now() - interval '5 minutes' where id = $1", [t.id]);
    expect(await claim("w2", ["generate"])).toMatchObject({ id: t.id, worker_id: "w2", attempts: 2 });
  });

  it("never claims a task with no attempts left, or before its run_after", async () => {
    await enqueue("generate", { attempts: 3 });
    await enqueue("generate", { run_after: new Date(Date.now() + 60_000).toISOString() });
    expect(await claim("w1", ["generate"])).toBeUndefined();
  });

  it("allows only one live task per job", async () => {
    const t = await enqueue("generate");
    await expect(enqueue("edit", { job_id: t.job_id })).rejects.toThrow(/studio_tasks_one_active_per_job|duplicate/);
    await db.query("update studio_tasks set status = 'done' where id = $1", [t.id]);
    await expect(enqueue("edit", { job_id: t.job_id })).resolves.toBeTruthy();
  });

  it("heartbeat bumps the task and the job only for the owning worker", async () => {
    const t = await enqueue("generate");
    await claim("w1", ["generate"]);
    await db.query("update studio_tasks set heartbeat_at = now() - interval '1 minute' where id = $1", [t.id]);
    const other = await db.query<{ ok: boolean }>("select heartbeat_studio_task($1, $2) as ok", [t.id, "w2"]);
    expect(other.rows[0]!.ok).toBe(false);
    const mine = await db.query<{ ok: boolean }>("select heartbeat_studio_task($1, $2) as ok", [t.id, "w1"]);
    expect(mine.rows[0]!.ok).toBe(true);
    const r = await db.query<{ task_age: number; job_age: number }>(
      `select extract(epoch from now() - t.heartbeat_at) as task_age, extract(epoch from now() - j.updated_at) as job_age
         from studio_tasks t join jobs j on j.id = t.job_id where t.id = $1`,
      [t.id],
    );
    expect(Number(r.rows[0]!.task_age)).toBeLessThan(5);
    expect(Number(r.rows[0]!.job_age)).toBeLessThan(5);
  });

  it("fails exhausted tasks (stale running or queued) and returns them", async () => {
    const stale = await enqueue("generate", { status: "running", attempts: 3, heartbeat_at: new Date(Date.now() - 600_000).toISOString() });
    const fresh = await enqueue("render", { status: "running", attempts: 3, heartbeat_at: new Date().toISOString() });
    const queued = await enqueue("edit", { attempts: 3 });
    const retryable = await enqueue("regenerate", { status: "running", attempts: 1, heartbeat_at: new Date(Date.now() - 600_000).toISOString() });
    const r = await db.query<Task>("select * from fail_exhausted_studio_tasks(90)");
    expect(r.rows.map((t) => t.id).sort()).toEqual([stale.id, queued.id].sort());
    const statuses = await db.query<{ id: string; status: string }>("select id, status from studio_tasks");
    const by = Object.fromEntries(statuses.rows.map((s) => [s.id, s.status]));
    expect(by[stale.id]).toBe("failed");
    expect(by[queued.id]).toBe("failed");
    expect(by[fresh.id]).toBe("running");
    expect(by[retryable.id]).toBe("running");
  });

  it("cascades task deletion with the job", async () => {
    const t = await enqueue("generate");
    await db.query("delete from jobs where id = $1", [t.job_id]);
    const r = await db.query("select 1 from studio_tasks");
    expect(r.rows).toHaveLength(0);
  });

  it("rejects unknown kinds and statuses", async () => {
    await expect(enqueue("transcode")).rejects.toThrow();
    await expect(enqueue("generate", { status: "paused" })).rejects.toThrow();
  });

  it("enables RLS with a service_role-only policy", async () => {
    const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = 'studio_tasks'");
    expect(rls.rows[0]!.relrowsecurity).toBe(true);
    const pol = await db.query<{ roles: string }>("select roles::text from pg_policies where tablename = 'studio_tasks'");
    expect(pol.rows.map((p) => p.roles)).toEqual(["{service_role}"]);
    const exec = await db.query<{ anon: boolean; service: boolean }>(
      "select has_function_privilege('anon', 'claim_studio_task(text, text[], int)', 'execute') as anon, has_function_privilege('service_role', 'claim_studio_task(text, text[], int)', 'execute') as service",
    );
    expect(exec.rows[0]).toEqual({ anon: false, service: true });
  });
});
