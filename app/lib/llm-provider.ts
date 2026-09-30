// Where Claude calls go: Anthropic directly, or OpenRouter's
// Anthropic-compatible Messages endpoint.
//
// With OPENROUTER_API_KEY set, every Claude call (Studio and the older
// hyperframes director) goes through OpenRouter unless
// ANTHROPIC_VIA_OPENROUTER=0. The official SDK is kept — only its baseURL and
// auth change — and a thin wrapper maps model ids ("claude-opus-5-5" →
// "anthropic/claude-opus-5.5") and drops Anthropic-only extras OpenRouter does
// not accept (the server-side refusal-fallback beta). Verified against
// OpenRouter: streaming, adaptive thinking + effort, json_schema output,
// prompt caching (cache writes + reads) and image input all work.

import Anthropic from "@anthropic-ai/sdk";

export const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";

export function claudeViaOpenRouter(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.OPENROUTER_API_KEY?.trim() && env.ANTHROPIC_VIA_OPENROUTER !== "0";
}

/** "claude-opus-5-5" → "anthropic/claude-opus-5.5"; ids that already have a provider prefix pass through. */
export function toOpenRouterModel(model: string): string {
  if (model.includes("/")) return model;
  return `anthropic/${model.replace(/-(\d+)-(\d+)$/, "-$1.$2")}`;
}

/** "anthropic/claude-opus-5.5" → "claude-opus-5-5", so pricing and logs use one name. */
export function canonicalClaudeModel(model: string): string {
  const bare = model.replace(/^anthropic\//, "");
  return bare.replace(/-(\d+)\.(\d+)$/, "-$1-$2");
}

type AnyParams = Record<string, unknown> & { model?: string };

function adaptParams(params: AnyParams): AnyParams {
  const { betas: _betas, fallbacks: _fallbacks, ...rest } = params as AnyParams & { betas?: unknown; fallbacks?: unknown };
  return { ...rest, ...(rest.model ? { model: toOpenRouterModel(rest.model) } : {}) };
}

type Callable = (params: AnyParams, options?: unknown) => unknown;

function wrapMethods(target: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    const original = target[name] as Callable | undefined;
    if (typeof original !== "function") continue;
    target[name] = (params: AnyParams, options?: unknown) => original.call(target, adaptParams(params), options);
  }
}

export function createClaudeClient(env: NodeJS.ProcessEnv = process.env): Anthropic {
  if (claudeViaOpenRouter(env)) {
    const client = new Anthropic({
      baseURL: OPENROUTER_ANTHROPIC_BASE_URL,
      apiKey: null,
      authToken: env.OPENROUTER_API_KEY!.trim(),
      defaultHeaders: { "HTTP-Referer": env.PUBLIC_APP_URL || "https://videly.io", "X-Title": "Videly" },
    });
    wrapMethods(client.messages as unknown as Record<string, unknown>, ["create", "stream", "countTokens"]);
    wrapMethods(client.beta.messages as unknown as Record<string, unknown>, ["create", "stream", "countTokens"]);
    return client;
  }
  // .env in this project spells it "ANTROPIC_API_KEY" (sic); honour both.
  const apiKey = env.ANTROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENROUTER_API_KEY, or ANTROPIC_API_KEY / ANTHROPIC_API_KEY, for Claude calls.");
  }
  return new Anthropic({ apiKey });
}
