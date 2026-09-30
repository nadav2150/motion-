// Keep the container awake while Studio work is pending.
//
// The Cloudflare Container sleeps 15 min after its last request
// (src/worker.ts sleepAfter), and a background task is not a request. A cron
// trigger runs every minute; keepContainerAwake() asks Supabase REST whether
// any studio_tasks are queued / running and, only then, sends a cheap request
// to the container (GET /api/internal/worker-ping), which resets the sleep
// timer — or starts the container, whose worker then resumes the work.
//
// Runs in the Workers runtime AND in Node (the ping route): WebCrypto + fetch
// only, no Node or app imports.

export const WORKER_PING_PATH = "/api/internal/worker-ping";
export const WORKER_PING_HEADER = "x-videly-worker-ping";

// Ignore tasks untouched for this long: a task stuck queued with no worker
// must not keep the container (and its bill) awake forever.
export const PENDING_WINDOW_MS = 6 * 60 * 60_000;

/**
 * The ping header value: HMAC-SHA256(secret, "videly-studio-worker-ping:v1"),
 * hex. Derived from IMPERSONATION_SECRET, which both the Worker and the
 * container already hold, so no new secret has to be provisioned; the HMAC
 * domain-separates it, so the token reveals nothing about the secret.
 */
export async function workerPingToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("videly-studio-worker-ping:v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type KeepAliveEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  IMPERSONATION_SECRET?: string;
};

type FetchLike = (input: string | Request, init?: RequestInit) => Promise<Response>;

/** Whether any studio_tasks row is queued or running (touched within PENDING_WINDOW_MS). */
export async function hasPendingStudioTasks(env: KeepAliveEnv, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const since = new Date(now - PENDING_WINDOW_MS).toISOString();
  const url =
    `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/studio_tasks` +
    `?select=id&queue=eq.prod&status=in.(queued,running)&updated_at=gte.${encodeURIComponent(since)}&limit=1`;
  const res = await fetchImpl(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`studio_tasks lookup failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

export type KeepAliveResult =
  | { pending: false; pinged: false; error?: string }
  | { pending: true; pinged: true; status: number }
  | { pending: true; pinged: false; error: string };

/** The cron decision: ping the container only when Studio work is pending. */
export async function keepContainerAwake(
  env: KeepAliveEnv,
  deps: { pingContainer: (req: Request) => Promise<Response>; fetch?: FetchLike; now?: number },
): Promise<KeepAliveResult> {
  let pending: boolean;
  try {
    pending = await hasPendingStudioTasks(env, deps.fetch ?? fetch, deps.now);
  } catch (err) {
    // If Supabase is unreachable the worker cannot make progress either.
    return { pending: false, pinged: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!pending) return { pending: false, pinged: false };
  try {
    const headers: Record<string, string> = {};
    if (env.IMPERSONATION_SECRET) headers[WORKER_PING_HEADER] = await workerPingToken(env.IMPERSONATION_SECRET);
    const res = await deps.pingContainer(new Request(`http://container${WORKER_PING_PATH}`, { headers }));
    // Drain so the connection is released.
    await res.arrayBuffer().catch(() => {});
    return { pending: true, pinged: true, status: res.status };
  } catch (err) {
    return { pending: true, pinged: false, error: err instanceof Error ? err.message : String(err) };
  }
}
