// The Worker cron's decision: ping the container only while Studio tasks are
// pending, with the derived ping token; and the ping route's auth.
import { describe, expect, it, vi } from "vitest";
import { hasPendingStudioTasks, keepContainerAwake, PENDING_WINDOW_MS, WORKER_PING_HEADER, workerPingToken } from "./keepalive";

const env = { SUPABASE_URL: "https://abc.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x", IMPERSONATION_SECRET: "s3cret" };
const NOW = Date.parse("2026-09-30T12:00:00Z");

function supabase(rows: unknown[] | { status: number }) {
  return vi.fn(async (_url: string | Request, _init?: RequestInit) =>
    Array.isArray(rows) ? Response.json(rows) : new Response("boom", { status: rows.status }),
  );
}

describe("hasPendingStudioTasks", () => {
  it("asks PostgREST for one recent queued/running task with the service key", async () => {
    const f = supabase([{ id: "t1" }]);
    expect(await hasPendingStudioTasks(env, f, NOW)).toBe(true);
    const [url, init] = f.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe("https://abc.supabase.co/rest/v1/studio_tasks");
    expect(u.searchParams.get("status")).toBe("in.(queued,running)");
    expect(u.searchParams.get("limit")).toBe("1");
    expect(u.searchParams.get("updated_at")).toBe(`gte.${new Date(NOW - PENDING_WINDOW_MS).toISOString()}`);
    expect((init!.headers as Record<string, string>).apikey).toBe("sb_secret_x");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sb_secret_x");
  });
  it("is false for an empty result", async () => {
    expect(await hasPendingStudioTasks(env, supabase([]), NOW)).toBe(false);
  });
});

describe("keepContainerAwake", () => {
  it("does not touch the container when nothing is pending", async () => {
    const ping = vi.fn(async () => new Response("ok"));
    expect(await keepContainerAwake(env, { fetch: supabase([]), pingContainer: ping, now: NOW })).toEqual({ pending: false, pinged: false });
    expect(ping).not.toHaveBeenCalled();
  });

  it("pings the container with the derived token when work is pending", async () => {
    const ping = vi.fn(async (_req: Request) => Response.json({ ok: true }));
    const res = await keepContainerAwake(env, { fetch: supabase([{ id: "t1" }]), pingContainer: ping, now: NOW });
    expect(res).toEqual({ pending: true, pinged: true, status: 200 });
    const req = ping.mock.calls[0]![0];
    expect(new URL(req.url).pathname).toBe("/api/internal/worker-ping");
    expect(req.method).toBe("GET");
    expect(req.headers.get(WORKER_PING_HEADER)).toBe(await workerPingToken("s3cret"));
  });

  it("does not ping when Supabase cannot be asked", async () => {
    const ping = vi.fn(async () => new Response("ok"));
    const res = await keepContainerAwake(env, { fetch: supabase({ status: 500 }), pingContainer: ping, now: NOW });
    expect(res).toMatchObject({ pending: false, pinged: false, error: expect.stringContaining("500") });
    expect(ping).not.toHaveBeenCalled();
    const missing = await keepContainerAwake({}, { fetch: supabase([{ id: "t" }]), pingContainer: ping, now: NOW });
    expect(missing.pinged).toBe(false);
  });

  it("reports a failed ping without throwing", async () => {
    const res = await keepContainerAwake(env, {
      fetch: supabase([{ id: "t1" }]),
      pingContainer: async () => {
        throw new Error("container not ready");
      },
      now: NOW,
    });
    expect(res).toEqual({ pending: true, pinged: false, error: "container not ready" });
  });
});

describe("workerPingToken", () => {
  it("is a stable HMAC that does not contain the secret", async () => {
    const a = await workerPingToken("s3cret");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await workerPingToken("s3cret")).toBe(a);
    expect(await workerPingToken("other")).not.toBe(a);
  });
});

describe("GET /api/internal/worker-ping", () => {
  it("403 without the token, 200 with it", async () => {
    process.env.IMPERSONATION_SECRET = "s3cret";
    const { loader } = await import("../../routes/api.internal.worker-ping");
    expect((await loader({ request: new Request("http://x/api/internal/worker-ping") })).status).toBe(403);
    const ok = await loader({
      request: new Request("http://x/api/internal/worker-ping", { headers: { [WORKER_PING_HEADER]: await workerPingToken("s3cret") } }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, inline: { enabled: false } });
  });
});
