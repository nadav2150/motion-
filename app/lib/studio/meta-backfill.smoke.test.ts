import { describe, expect, it } from "vitest";
import { captureFrames } from "./render";
import { ensureVidelyMeta } from "./validate";

// A document that never declares window.__videly, and one that overwrites it
// without the numbers, both expose the right meta to the real renderer once
// ensureVidelyMeta has run.
describe.runIf(process.env.RUN_RENDER_TESTS === "1")("ensureVidelyMeta in a real browser", () => {
  const want = { duration: 2, fps: 30, width: 640, height: 360 };
  const body = `<body style="margin:0;width:640px;height:360px;background:#123"><div>hi</div></body>`;
  for (const [name, head] of [
    ["missing", ""],
    ["overwritten later", ""],
  ] as const) {
    it(name, async () => {
      // Mirrors real documents: a GSAP-like timeline (circular, full of
      // functions) and a ready Promise hang off window.__videly.
      const late =
        name === "overwritten later"
          ? `<script>var tl = { kill: function () {} }; tl.self = tl; window.__videly = { timeline: tl, ready: Promise.resolve() };</script>`
          : `<script>var t2 = { seek: function () {} }; t2.parent = t2; window.__videly.timeline = t2; window.__videly.ready = Promise.resolve();</script>`;
      const html = ensureVidelyMeta(`<!DOCTYPE html><html><head>${head}</head>${body.replace("</body>", `${late}</body>`)}</html>`, want);
      const r = await captureFrames({ html, ...want, seed: 1, allowedHosts: [] }, [0, 1]);
      expect(r.meta).toEqual(want);
      expect(r.frames).toHaveLength(2);
    }, 60_000);
  }
});
