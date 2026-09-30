import { describe, expect, it } from "vitest";
import { canonicalClaudeModel, claudeViaOpenRouter, createClaudeClient, toOpenRouterModel } from "./llm-provider";
import { usdMicrosForAnthropic } from "./billing/pricing-usd";

describe("llm-provider", () => {
  it("maps model ids both ways", () => {
    expect(toOpenRouterModel("claude-opus-5-5")).toBe("anthropic/claude-opus-5.5");
    expect(toOpenRouterModel("claude-sonnet-4-6")).toBe("anthropic/claude-sonnet-4.6");
    expect(toOpenRouterModel("anthropic/claude-opus-5.5")).toBe("anthropic/claude-opus-5.5");
    expect(canonicalClaudeModel("anthropic/claude-opus-5.5")).toBe("claude-opus-5-5");
    expect(canonicalClaudeModel("claude-opus-5-5")).toBe("claude-opus-5-5");
  });

  it("prices OpenRouter model names like the direct ones", () => {
    const usage = { input_tokens: 1000, output_tokens: 1000 };
    expect(usdMicrosForAnthropic("anthropic/claude-opus-5.5", usage)).toBe(usdMicrosForAnthropic("claude-opus-5-5", usage));
  });

  it("uses OpenRouter only when the key is set and not opted out", () => {
    expect(claudeViaOpenRouter({ OPENROUTER_API_KEY: "k" } as NodeJS.ProcessEnv)).toBe(true);
    expect(claudeViaOpenRouter({ OPENROUTER_API_KEY: "k", ANTHROPIC_VIA_OPENROUTER: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(claudeViaOpenRouter({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("rewrites the model and drops Anthropic-only extras on OpenRouter", async () => {
    const client = createClaudeClient({ OPENROUTER_API_KEY: "k" } as NodeJS.ProcessEnv);
    expect(client.baseURL).toBe("https://openrouter.ai/api");
    let sent: Record<string, unknown> | null = null;
    // Capture what reaches the SDK's HTTP layer.
    (client as unknown as { fetch: typeof fetch }).fetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "anthropic/claude-opus-5.5", content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await client.beta.messages.create({ model: "claude-opus-5-5", max_tokens: 10, messages: [{ role: "user", content: "hi" }], betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as never);
    expect(sent!.model).toBe("anthropic/claude-opus-5.5");
    expect(sent).not.toHaveProperty("fallbacks");
    expect(sent).not.toHaveProperty("betas");
  });
});
