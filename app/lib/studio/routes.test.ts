// Route auth: every Studio route answers 401 without a session and 404 for a
// job the caller does not own. Auth and the DB lookup are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState: { user: { id: string } | null } = { user: null };

vi.mock("../auth", () => ({
  requireUserApi: vi.fn(async () => {
    if (!authState.user) {
      throw new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }
    return { user: authState.user, headers: new Headers() };
  }),
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    // Every job in this test belongs to someone else.
    getOwnedStudioJob: vi.fn(async () => null),
    listStudioVideos: vi.fn(async () => ({ items: [], nextCursor: null })),
  };
});

vi.mock("../jobs", () => ({ getJob: vi.fn(), deleteJob: vi.fn(), updateJobBrand: vi.fn() }));

async function status(p: Promise<Response> | Response): Promise<number> {
  try {
    return (await p).status;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

const params = { id: "00000000-0000-4000-8000-000000000001" };
const json = (method: string, body: unknown = {}) =>
  new Request("http://x/api", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const get = (q = "") => new Request(`http://x/api${q}`);

type Handler = (args: { request: Request; params: Record<string, string> }) => Promise<Response> | Response;

async function routes(): Promise<{ name: string; handler: Handler; req: () => Request; owned: boolean }[]> {
  const edit = await import("../../routes/api.jobs.$id.edit");
  const regen = await import("../../routes/api.jobs.$id.regenerate");
  const revert = await import("../../routes/api.jobs.$id.revert");
  const doc = await import("../../routes/api.jobs.$id.document");
  const timeline = await import("../../routes/api.jobs.$id.timeline");
  const render = await import("../../routes/api.jobs.$id.render");
  const download = await import("../../routes/api.jobs.$id.download");
  const job = await import("../../routes/api.jobs.$id");
  const dup = await import("../../routes/api.studio.videos.$id.duplicate");
  const videos = await import("../../routes/api.studio.videos");
  const create = await import("../../routes/api.studio.jobs");
  const kit = await import("../../routes/api.brand-kit");
  const assets = await import("../../routes/api.assets");
  const usage = await import("../../routes/api.me.usage");
  const h = (f: unknown) => f as Handler;
  return [
    { name: "edit", handler: h(edit.action), req: () => json("POST", { instruction: "x" }), owned: true },
    { name: "regenerate", handler: h(regen.action), req: () => json("POST"), owned: true },
    { name: "revert", handler: h(revert.action), req: () => json("POST", { revision: 1 }), owned: true },
    { name: "document", handler: h(doc.loader), req: () => get("?rev=1"), owned: true },
    { name: "timeline", handler: h(timeline.loader), req: () => get(), owned: true },
    { name: "render", handler: h(render.action), req: () => json("POST", {}), owned: true },
    { name: "download", handler: h(download.loader), req: () => get(), owned: true },
    { name: "GET job", handler: h(job.loader), req: () => get(), owned: true },
    { name: "duplicate", handler: h(dup.action), req: () => json("POST"), owned: true },
    { name: "videos", handler: h(videos.loader), req: () => get(), owned: false },
    { name: "create", handler: h(create.action), req: () => json("POST", { prompt: "x" }), owned: false },
    { name: "brand-kit", handler: h(kit.loader), req: () => get(), owned: false },
    { name: "assets", handler: h(assets.loader), req: () => get(), owned: false },
    { name: "usage", handler: h(usage.loader), req: () => get(), owned: false },
  ];
}

beforeEach(() => {
  authState.user = null;
});

describe("Studio routes", () => {
  it("return 401 when signed out", async () => {
    for (const r of await routes()) {
      expect(await status(r.handler({ request: r.req(), params })), r.name).toBe(401);
    }
  });

  it("return 404 for a job the caller does not own", async () => {
    authState.user = { id: "user-b" };
    for (const r of (await routes()).filter((x) => x.owned)) {
      expect(await status(r.handler({ request: r.req(), params })), r.name).toBe(404);
    }
  });

  it("serves templates without auth", async () => {
    const t = await import("../../routes/api.studio.templates");
    const res = await t.loader({ request: get("?category=ads") } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { category: string }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i) => i.category === "ads")).toBe(true);
  });
});
