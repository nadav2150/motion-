import { afterEach, describe, expect, it } from "vitest";
import { __setStreamImpl } from "./anthropic";
import { applyPatchEdits, patchOrRewrite, type DocContext } from "./edit";
import { FORMAT_PRESETS } from "./types";

function fakeMessage(text: string) {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as never;
}

afterEach(() => __setStreamImpl(null));

const DOC = `<!DOCTYPE html><html><head><title>A</title></head><body><h1 class="t">Hello</h1><p>World</p></body></html>`;
const ctx: DocContext = { preset: FORMAT_PRESETS["16:9"], duration: 10, fps: 30, seed: 1, allowedHosts: [] };

describe("applyPatchEdits", () => {
  it("applies edits in order", () => {
    const r = applyPatchEdits(DOC, [
      { find: "Hello", replace: "Hi" },
      { find: "<h1 class=\"t\">Hi", replace: "<h1 class=\"t big\">Hi" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.html).toContain('<h1 class="t big">Hi</h1>');
  });
  it("reports a missing find and leaves the document untouched", () => {
    const r = applyPatchEdits(DOC, [
      { find: "Hello", replace: "Hi" },
      { find: "Nope", replace: "x" },
    ]);
    expect(r).toMatchObject({ ok: false, failedIndex: 1, reason: "missing", applied: 1 });
    expect(r.html).toBe(DOC);
  });
  it("rejects ambiguous finds", () => {
    const r = applyPatchEdits("<p>a</p><p>a</p>", [{ find: "<p>a</p>", replace: "" }]);
    expect(r).toMatchObject({ ok: false, reason: "ambiguous" });
  });
  it("rejects empty finds", () => {
    expect(applyPatchEdits(DOC, [{ find: "", replace: "x" }])).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("patchOrRewrite", () => {
  it("uses the patch when every find applies", async () => {
    const calls: string[] = [];
    __setStreamImpl(async (p) => {
      calls.push(String((p as { output_config?: { format?: unknown } }).output_config?.format ? "patch" : "rewrite"));
      return fakeMessage(JSON.stringify({ mode: "patch", summary: "Bigger title", edits: [{ find: "Hello", replace: "HELLO" }] }));
    });
    const r = await patchOrRewrite(DOC, { kind: "edit", instruction: "shout" }, ctx);
    expect(r.mode).toBe("patch");
    expect(r.html).toContain("HELLO");
    expect(r.summary).toBe("Bigger title");
    expect(calls).toEqual(["patch"]);
  });

  it("falls back to a full rewrite when a find string is missing", async () => {
    const rewritten = DOC.replace("World", "Everyone");
    const calls: string[] = [];
    __setStreamImpl(async (p) => {
      const isPatch = !!(p as { output_config?: { format?: unknown } }).output_config?.format;
      calls.push(isPatch ? "patch" : "rewrite");
      return isPatch
        ? fakeMessage(JSON.stringify({ mode: "patch", summary: "s", edits: [{ find: "Not in doc", replace: "x" }] }))
        : fakeMessage("Here you go:\n" + rewritten);
    });
    const r = await patchOrRewrite(DOC, { kind: "edit", instruction: "change" }, ctx);
    expect(calls).toEqual(["patch", "rewrite"]);
    expect(r.mode).toBe("rewrite");
    expect(r.html).toBe(rewritten);
  });

  it("falls back to a rewrite when the model asks for one", async () => {
    __setStreamImpl(async (p) =>
      (p as { output_config?: { format?: unknown } }).output_config?.format
        ? fakeMessage(JSON.stringify({ mode: "rewrite", summary: "new style", edits: [] }))
        : fakeMessage(DOC),
    );
    const r = await patchOrRewrite(DOC, { kind: "repair", issues: [{ code: "body_size", severity: "error", message: "m" }] }, ctx);
    expect(r.mode).toBe("rewrite");
  });

  it("throws when the rewrite is not a document", async () => {
    __setStreamImpl(async (p) =>
      (p as { output_config?: { format?: unknown } }).output_config?.format
        ? fakeMessage(JSON.stringify({ mode: "rewrite", summary: "", edits: [] }))
        : fakeMessage("sorry"),
    );
    await expect(patchOrRewrite(DOC, { kind: "edit", instruction: "x" }, ctx)).rejects.toThrow(/HTML document/);
  });
});
