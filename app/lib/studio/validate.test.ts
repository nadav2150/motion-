import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ensureVidelyMeta, parseVidelyMeta, smokeRender, smokeTimes, staticCheck, validateDocument } from "./validate";
import type { CaptureResult, RenderInput } from "./render";

const expect1080 = { duration: 10, fps: 30, width: 1920, height: 1080 };
const HOST = "abc.supabase.co";

function doc(opts: { head?: string; body?: string; css?: string; meta?: string } = {}): string {
  const meta = opts.meta ?? "window.__videly = { duration: 10, fps: 30, width: 1920, height: 1080 };";
  const css = opts.css ?? "html,body{margin:0;width:1920px;height:1080px;overflow:hidden}";
  return `<!DOCTYPE html><html><head><script>${meta}</script><style>${css}</style>${opts.head ?? ""}</head><body>${opts.body ?? "<h1>Hi</h1>"}</body></html>`;
}

const codes = (html: string) =>
  staticCheck(html, { expect: expect1080, allowedHosts: [HOST] })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);

describe("staticCheck", () => {
  it("passes a clean document", () => {
    expect(
      codes(
        doc({
          head: '<script src="/studio-libs/gsap/gsap.min.js"></script><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">',
          body: `<img src="https://${HOST}/storage/v1/object/public/storyboards/a.png"><svg xmlns="http://www.w3.org/2000/svg"></svg>`,
        }),
      ),
    ).toEqual([]);
  });
  it("rejects fragments", () => {
    expect(codes("<div>hi</div>")).toEqual(["parse"]);
  });
  it("requires numeric __videly in head matching the canvas", () => {
    expect(codes(doc({ meta: "var x = 1;" }))).toContain("meta_missing");
    expect(codes(doc({ meta: "window.__videly = { duration: 10, fps: 24, width: 1920, height: 1080 };" }))).toContain("meta_mismatch");
    expect(codes(doc({ meta: "window.__videly = { duration: D, fps: 30, width: 1920, height: 1080 };" }))).toContain("meta_missing");
    // duration within ±0.5s is fine
    expect(codes(doc({ meta: "window.__videly = { duration: 10.3, fps: 30, width: 1920, height: 1080 };" }))).toEqual([]);
  });
  it("checks the body size", () => {
    expect(codes(doc({ css: "body{margin:0;width:1080px;height:1920px}" }))).toContain("body_size");
    expect(codes(doc({ css: "body { margin: 0; width: 1920px; height: 1080px; }" }))).toEqual([]);
  });
  it("blocks network APIs, foreign scripts, external URLs and audio", () => {
    expect(codes(doc({ body: "<script>fetch('/x')</script>" }))).toContain("network_api");
    expect(codes(doc({ body: "<script>new WebSocket('wss://x')</script>" }))).toContain("network_api");
    expect(codes(doc({ head: '<script src="https://cdn.jsdelivr.net/npm/gsap"></script>' }))).toEqual(
      expect.arrayContaining(["script_src", "external_url"]),
    );
    expect(codes(doc({ body: '<img src="https://evil.example.com/a.png">' }))).toContain("external_url");
    expect(codes(doc({ body: '<audio src="a.mp3"></audio>' }))).toContain("embedded_audio");
  });
  it("limits document size", () => {
    expect(codes(doc({ body: "x".repeat(700 * 1024) }))).toContain("too_large");
  });
  it("parses the meta object", () => {
    expect(parseVidelyMeta("window.__videly={duration:12.5,fps:30,width:1080,height:1920}")).toEqual({
      duration: 12.5,
      fps: 30,
      width: 1080,
      height: 1920,
    });
  });
});

async function solid(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 36, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
}

async function pattern(seed: number): Promise<Buffer> {
  const raw = Buffer.alloc(64 * 36 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7 + seed * 53) % 255;
  return sharp(raw, { raw: { width: 64, height: 36, channels: 3 } }).jpeg().toBuffer();
}

function fakeCapture(frameFor: (i: number) => Promise<Buffer>, extra: Partial<CaptureResult> = {}) {
  return async (input: RenderInput, times: number[]): Promise<CaptureResult> => ({
    frames: await Promise.all(times.map(async (time, i) => ({ time, jpeg: await frameFor(i) }))),
    meta: { duration: input.duration, fps: input.fps, width: input.width, height: input.height },
    issues: [],
    webglAvailable: true,
    ...extra,
  });
}

const smokeIn = { html: doc(), width: 1920, height: 1080, fps: 30, duration: 10, seed: 1, allowedHosts: [HOST] };

describe("smokeRender", () => {
  it("samples 0/10/30/50/80/99%", () => {
    expect(smokeTimes(10, 30)).toEqual([0, 1, 3, 5, 8, 9.9]);
  });
  it("is clean for varied frames", async () => {
    const r = await smokeRender(smokeIn, fakeCapture((i) => pattern(i)));
    expect(r.issues).toEqual([]);
    expect(r.frames).toHaveLength(6);
  });
  it("flags blank frames after t=0", async () => {
    const r = await smokeRender(smokeIn, fakeCapture((i) => (i === 0 || i === 3 ? solid(0, 0, 0) : pattern(i))));
    const blank = r.issues.filter((i) => i.code === "blank_frame");
    expect(blank).toHaveLength(1);
    expect(blank[0]!.time).toBe(5);
  });
  it("flags a static video", async () => {
    const r = await smokeRender(smokeIn, fakeCapture(() => pattern(1)));
    expect(r.issues.map((i) => i.code)).toContain("static_video");
  });
  it("maps page issues and missing meta", async () => {
    const r = await smokeRender(
      smokeIn,
      fakeCapture((i) => pattern(i), {
        meta: null,
        issues: [
          { kind: "pageerror", message: "gsap is not defined" },
          { kind: "pageerror", message: "gsap is not defined" },
          { kind: "blocked_request", message: "https://x.com/a.js" },
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toEqual(["page_error", "blocked_request", "meta_missing"]);
  });
  it("reports a renderer failure as render_failed", async () => {
    const r = await smokeRender(smokeIn, async () => {
      throw new Error("captureFrames: not implemented yet");
    });
    expect(r.issues[0]!.code).toBe("render_failed");
  });
});

describe("validateDocument", () => {
  it("combines static and smoke results", async () => {
    const r = await validateDocument(
      doc({ body: "<script>fetch('x')</script>" }),
      { expect: expect1080, allowedHosts: [HOST], seed: 1 },
      fakeCapture((i) => pattern(i)),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(["network_api"]);
  });
});

describe("ensureVidelyMeta", () => {
  const want = { duration: 30, fps: 30, width: 1920, height: 1080 };
  const doc = (head: string) => `<!DOCTYPE html><html><head>${head}</head><body><div></div></body></html>`;

  it("leaves a correct declaration alone", () => {
    const html = doc(`<script>window.__videly = { duration: 30, fps: 30, width: 1920, height: 1080 };</script>`);
    expect(ensureVidelyMeta(html, want)).toBe(html);
  });

  it("adds the declaration and a backfill when it is missing or written another way", () => {
    for (const head of ["", `<script>window.__videly = Object.assign({}, { duration: 30 });</script>`]) {
      const out = ensureVidelyMeta(doc(head), want);
      expect(staticCheck(out, { expect: want, allowedHosts: [] }).filter((i) => i.code.startsWith("meta"))).toEqual([]);
      expect(out.indexOf("data-videly-meta")).toBeLessThan(out.indexOf("</head>"));
      expect(out.lastIndexOf("data-videly-meta")).toBeGreaterThan(out.indexOf("<body>"));
    }
  });

  it("corrects wrong numbers and is idempotent", () => {
    const out = ensureVidelyMeta(doc(`<script>window.__videly = { duration: 12, fps: 24, width: 800, height: 600 };</script>`), want);
    expect(parseVidelyMeta(out)).toEqual(want);
    expect(ensureVidelyMeta(out, want)).toBe(out);
  });
});
