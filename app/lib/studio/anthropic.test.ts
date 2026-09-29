import { afterEach, describe, expect, it } from "vitest";
import {
  __setStreamImpl,
  buildRequest,
  callOpus,
  extractHtmlDocument,
  newTokenBudget,
  StudioRefusalError,
  TokenBudgetExceededError,
  TruncatedOutputError,
} from "./anthropic";
import { withMeterContext } from "../billing/meter";

type Fake = { text?: string; stop?: string; usage?: Partial<Record<string, number>>; model?: string };

export function fakeMessage(f: Fake) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: f.model ?? "claude-opus-5-5",
    content: f.text !== undefined ? [{ type: "text", text: f.text, citations: null }] : [],
    stop_reason: f.stop ?? "end_turn",
    stop_sequence: null,
    stop_details: f.stop === "refusal" ? { type: "refusal", category: "cyber", explanation: null } : null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1000,
      ...f.usage,
    },
  } as never;
}

afterEach(() => __setStreamImpl(null));

const base = {
  system: [{ text: "core", cache: true }, { text: "task" }],
  messages: [{ role: "user" as const, content: "hi" }],
  effort: "high" as const,
  maxTokens: 1000,
  reason: "opus_studio_plan" as const,
};

describe("buildRequest", () => {
  it("sends adaptive thinking, explicit effort, fallback beta and cache_control", () => {
    const req = buildRequest({ ...base, schema: { type: "object" } }) as unknown as Record<string, unknown>;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.thinking).toEqual({ type: "adaptive" });
    expect(req.output_config).toEqual({ effort: "high", format: { type: "json_schema", schema: { type: "object" } } });
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.fallbacks).toBe("default");
    const system = req.system as Array<Record<string, unknown>>;
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[1]!.cache_control).toBeUndefined();
    expect(req).not.toHaveProperty("temperature");
    expect(JSON.stringify(req)).not.toContain("budget_tokens");
  });
  it("encodes images as base64 sources", () => {
    const req = buildRequest({
      ...base,
      messages: [{ role: "user", content: [{ type: "image", image: { mediaType: "image/jpeg", data: "AAAA" } }] }],
    }) as unknown as { messages: Array<{ content: Array<Record<string, unknown>> }> };
    expect(req.messages[0]!.content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AAAA" },
    });
  });
});

describe("callOpus", () => {
  it("parses structured JSON", async () => {
    __setStreamImpl(async () => fakeMessage({ text: '{"a":1}' }));
    const r = await callOpus<{ a: number }>({ ...base, schema: { type: "object" } });
    expect(r.json).toEqual({ a: 1 });
    expect(r.usage.cache_read_input_tokens).toBe(1000);
  });
  it("throws on refusal before reading content", async () => {
    __setStreamImpl(async () => fakeMessage({ text: "partial", stop: "refusal" }));
    await expect(callOpus(base)).rejects.toBeInstanceOf(StudioRefusalError);
  });
  it("throws on max_tokens truncation", async () => {
    __setStreamImpl(async () => fakeMessage({ text: "<html", stop: "max_tokens" }));
    await expect(callOpus(base)).rejects.toBeInstanceOf(TruncatedOutputError);
  });
  it("retries once when overloaded", async () => {
    let calls = 0;
    __setStreamImpl(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("Overloaded"), { status: 529 });
      return fakeMessage({ text: "ok" });
    });
    const r = await callOpus(base);
    expect(r.text).toBe("ok");
    expect(calls).toBe(2);
  }, 10_000);
  it("does not retry other errors", async () => {
    let calls = 0;
    __setStreamImpl(async () => {
      calls++;
      throw Object.assign(new Error("bad request"), { status: 400 });
    });
    await expect(callOpus(base)).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });
  it("accumulates the token budget and refuses once exhausted", async () => {
    __setStreamImpl(async () => fakeMessage({ text: "x", usage: { input_tokens: 600, output_tokens: 400, cache_read_input_tokens: 0 } }));
    const budget = newTokenBudget(1500);
    await withMeterContext({ userId: null, jobId: null, tokenBudget: budget }, async () => {
      await callOpus(base);
      expect(budget.used).toBe(1000);
      await callOpus(base);
      await expect(callOpus(base)).rejects.toBeInstanceOf(TokenBudgetExceededError);
    });
  });
});

describe("extractHtmlDocument", () => {
  it("pulls the document out of fences and chatter", () => {
    expect(extractHtmlDocument("Sure!\n```html\n<!DOCTYPE html><html><body></body></html>\n```")).toBe(
      "<!DOCTYPE html><html><body></body></html>",
    );
    expect(extractHtmlDocument("<html lang=en><body>x</body></html> trailing")).toBe("<html lang=en><body>x</body></html>");
    expect(extractHtmlDocument("no html here")).toBeNull();
  });
});
